"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PERSONAL_DATA_CONSENT_VERSION,
  type BaristaOrder,
  type CreateOrderInput,
  type CustomerOrder,
  type CustomerOrderReference,
  type OrderStatus,
} from "@/lib/orderTypes";

export type {
  BaristaOrder,
  CustomerOrder,
  OrderItem,
  OrderStatus,
} from "@/lib/orderTypes";

const activeOrderStorageKey = "kafema-active-server-order-v1";
const customerPollIntervalMs = 4_000;
const baristaPollIntervalMs = 3_000;

export class OrderClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
  }
}

export async function createOrder(
  input: Omit<CreateOrderInput, "personalDataConsentVersion">,
  idempotencyKey: string,
) {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      ...input,
      personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
    }),
    cache: "no-store",
  });
  const payload = await readJson<{
    order?: CustomerOrder;
    accessToken?: string;
    error?: string;
    code?: string;
  }>(response);
  if (!response.ok || !payload.order || !payload.accessToken) {
    throw toClientError(response, payload);
  }
  const reference = { id: payload.order.id, accessToken: payload.accessToken };
  storeActiveOrderReference(reference);
  return { order: payload.order, reference };
}

export function useCustomerOrder(reference: CustomerOrderReference | null) {
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(reference));

  useEffect(() => {
    if (!reference) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      let shouldContinue = true;
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(reference.id)}`, {
          headers: { Authorization: `Bearer ${reference.accessToken}` },
          cache: "no-store",
        });
        const payload = await readJson<{ order?: CustomerOrder; error?: string }>(response);
        if (!response.ok || !payload.order) throw toClientError(response, payload);
        if (!cancelled) {
          setOrder(payload.order);
          setError(null);
          shouldContinue = payload.order.status !== "completed";
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            pollError instanceof Error
              ? pollError.message
              : "Не удалось обновить статус заказа.",
          );
        }
      } finally {
        if (!cancelled && shouldContinue) {
          setIsLoading(false);
          timer = window.setTimeout(poll, customerPollIntervalMs);
        } else if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [reference]);

  return {
    order: reference ? order : null,
    error: reference ? error : null,
    isLoading: reference ? isLoading : false,
    setOrder,
  };
}

export function useBaristaOrders() {
  const [orders, setOrders] = useState<BaristaOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/bar/orders", {
      cache: "no-store",
    });
    const payload = await readJson<{ orders?: BaristaOrder[]; error?: string }>(response);
    if (!response.ok || !payload.orders) throw toClientError(response, payload);
    setOrders(payload.orders);
    setError(null);
    setStatus(response.status);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const poll = async () => {
      let shouldContinue = true;
      try {
        await refresh();
      } catch (pollError) {
        if (!cancelled) {
          const clientError = pollError instanceof OrderClientError ? pollError : null;
          setError(
            pollError instanceof Error ? pollError.message : "Не удалось обновить очередь.",
          );
          setStatus(clientError?.status ?? 0);
          shouldContinue = clientError?.status !== 401 && clientError?.status !== 503;
        }
      } finally {
        if (!cancelled && shouldContinue) {
          setIsLoading(false);
          timer = window.setTimeout(poll, baristaPollIntervalMs);
        } else if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [refresh]);

  const updateStatus = useCallback(
    async (orderId: string, nextStatus: OrderStatus) => {
      const response = await fetch(
        `/api/bar/orders/${encodeURIComponent(orderId)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
          cache: "no-store",
        },
      );
      const payload = await readJson<{ order?: BaristaOrder; error?: string }>(response);
      if (!response.ok || !payload.order) throw toClientError(response, payload);
      const updatedOrder = payload.order;
      setOrders((current) =>
        current.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
      );
      return updatedOrder;
    },
    [],
  );

  return {
    orders,
    error,
    status,
    isLoading,
    refresh,
    updateStatus,
  };
}

export function getStoredActiveOrderReference(): CustomerOrderReference | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(activeOrderStorageKey);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<CustomerOrderReference>;
    return typeof parsed.id === "string" && typeof parsed.accessToken === "string"
      ? { id: parsed.id, accessToken: parsed.accessToken }
      : null;
  } catch {
    return null;
  }
}

export function storeActiveOrderReference(reference: CustomerOrderReference) {
  localStorage.setItem(activeOrderStorageKey, JSON.stringify(reference));
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

function toClientError(
  response: Response,
  payload: { error?: string; code?: string },
) {
  return new OrderClientError(
    payload.error || "Сервис заказов временно недоступен.",
    response.status,
    payload.code ?? null,
  );
}

export async function requestOrderPayment(reference: CustomerOrderReference, create = false) {
  const response = await fetch(`/api/orders/${encodeURIComponent(reference.id)}/payment`, {
    method: create ? "POST" : "GET",
    headers: { Authorization: `Bearer ${reference.accessToken}` },
    cache: "no-store",
  });
  const payload = await readJson<{
    paymentStatus?: import("@/lib/orderTypes").PaymentStatus;
    confirmationUrl?: string | null;
    error?: string;
    code?: string;
  }>(response);
  if (!response.ok || !payload.paymentStatus) throw toClientError(response, payload);
  return payload;
}
