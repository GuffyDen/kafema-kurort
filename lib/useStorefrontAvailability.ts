"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StorefrontAvailabilitySnapshot } from "@/lib/storefrontAvailabilityTypes";

const pollIntervalMs = 15_000;

export function useStorefrontAvailability() {
  const [snapshot, setSnapshot] =
    useState<StorefrontAvailabilitySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<StorefrontAvailabilitySnapshot> | null>(
    null,
  );
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("Нет подключения к интернету");
    }

    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const request = fetchAvailability();
    inFlightRef.current = request;

    try {
      const next = await request;
      if (mountedRef.current) {
        setSnapshot(next);
        setError(null);
      }
      return next;
    } catch (refreshError) {
      const message =
        refreshError instanceof Error
          ? refreshError.message
          : "Не удалось проверить наличие";
      if (mountedRef.current) setError(message);
      throw refreshError;
    } finally {
      inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let interval: number | null = null;

    function startPolling() {
      if (interval !== null || document.visibilityState !== "visible") return;

      interval = window.setInterval(() => {
        void refresh().catch(() => undefined);
      }, pollIntervalMs);
    }

    function stopPolling() {
      if (interval === null) return;
      window.clearInterval(interval);
      interval = null;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => undefined);
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === "visible") {
      void refresh().catch(() => undefined);
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return {
    snapshot,
    error,
    refresh,
  };
}

async function fetchAvailability() {
  const response = await fetch("/api/storefront/availability", {
    cache: "no-store",
  });
  const payload = (await response.json()) as StorefrontAvailabilitySnapshot & {
    error?: string;
  };

  if (!response.ok || !payload.checkedAt || !payload.items) {
    throw new Error(payload.error || "Не удалось проверить наличие");
  }

  return payload;
}
