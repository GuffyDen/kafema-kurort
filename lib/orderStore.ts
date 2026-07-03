"use client";

import { useSyncExternalStore } from "react";

export type OrderStatus = "new" | "in_progress" | "ready" | "completed";

export type OrderItem = {
  id: string;
  name: string;
  volume: string;
  modifiers?: string[];
  baristaType?: "drink" | "food";
  categoryId?: string;
  categoryName?: string;
  workingZoneId?: string;
  type?: string;
  quantity: number;
};

export type Order = {
  id: string;
  number: string;
  customerName: string;
  phone: string;
  comment?: string;
  createdAt: string;
  statusChangedAt?: number;
  items: OrderItem[];
  status: OrderStatus;
  source?: "client" | "mock" | "iiko";
  total?: number;
};

type CreateOrderInput = {
  customerName: string;
  phone: string;
  comment?: string;
  items: OrderItem[];
  total?: number;
};

const storageKey = "kafema_orders";
const legacyStorageKey = "kafema-orders-v1";
const channelName = "kafema-orders";

const initialOrders: Order[] = [];

let orders = initialOrders;
let hydrated = false;
let channel: BroadcastChannel | null = null;

const listeners = new Set<() => void>();

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (!channel) {
    channel = new BroadcastChannel(channelName);
    channel.addEventListener("message", (event: MessageEvent<Order[]>) => {
      if (!Array.isArray(event.data)) {
        return;
      }

      orders = event.data;
      saveOrders(false);
      notify();
    });
  }

  return channel;
}

function hydrateOrders() {
  if (hydrated || !canUseBrowserStorage()) {
    return;
  }

  hydrated = true;

  const savedOrders = localStorage.getItem(storageKey);
  const legacyOrders = localStorage.getItem(legacyStorageKey);

  if (!savedOrders && !legacyOrders) {
    saveOrders(false);
    return;
  }

  try {
    const parsedOrders = JSON.parse(savedOrders ?? legacyOrders ?? "[]") as Order[];

    if (Array.isArray(parsedOrders)) {
      orders = parsedOrders;
      saveOrders(false);
    }
  } catch {
    orders = initialOrders;
    saveOrders(false);
  }
}

function saveOrders(shouldBroadcast = true) {
  if (!canUseBrowserStorage()) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(orders));

  if (shouldBroadcast) {
    getChannel()?.postMessage(orders);
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setOrders(nextOrders: Order[]) {
  orders = nextOrders;
  saveOrders();
  notify();
}

function getSnapshot() {
  hydrateOrders();
  return orders;
}

function getServerSnapshot() {
  return initialOrders;
}

function subscribe(listener: () => void) {
  hydrateOrders();
  getChannel();
  listeners.add(listener);

  function syncStorage(event: StorageEvent) {
    if (event.key !== storageKey || !event.newValue) {
      return;
    }

    try {
      orders = JSON.parse(event.newValue) as Order[];
      notify();
    } catch {
      // Ignore malformed storage updates.
    }
  }

  window.addEventListener("storage", syncStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", syncStorage);
  };
}

function generateOrderNumber() {
  const usedNumbers = new Set(orders.map((order) => order.number));
  let nextNumber = String(Math.floor(Math.random() * 900) + 100);

  while (usedNumbers.has(nextNumber)) {
    nextNumber = String(Math.floor(Math.random() * 900) + 100);
  }

  return nextNumber;
}

function getCurrentTime() {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export function createOrder(input: CreateOrderInput) {
  hydrateOrders();

  const order: Order = {
    id: `order-${Date.now()}`,
    number: generateOrderNumber(),
    customerName: input.customerName,
    phone: input.phone,
    comment: input.comment?.trim() || undefined,
    createdAt: getCurrentTime(),
    statusChangedAt: Date.now(),
    items: input.items,
    status: "new",
    source: "client",
    total: input.total,
  };

  setOrders([...orders, order]);

  return order;
}

export function updateOrderStatus(orderId: string, status: OrderStatus) {
  hydrateOrders();
  const targetOrder = orders.find((order) => order.id === orderId);

  if (!targetOrder) {
    return;
  }

  setOrders([
    ...orders.filter((order) => order.id !== orderId),
    { ...targetOrder, status, statusChangedAt: Date.now() },
  ]);
}

export function useOrders() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useOrder(orderId: string | null) {
  const currentOrders = useOrders();

  if (!orderId) {
    return null;
  }

  return currentOrders.find((order) => order.id === orderId) ?? null;
}
