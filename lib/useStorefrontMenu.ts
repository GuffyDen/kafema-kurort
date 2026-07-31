"use client";

import { useCallback, useEffect, useState } from "react";
import type { MenuState } from "@/lib/menuStore";

const emptyMenu: MenuState = {
  categories: [],
  workingZones: [
    {
      id: "bar",
      name: "Бар",
      icon: "",
      isActive: true,
      sortOrder: 10,
    },
  ],
  addonGroups: [],
  menuItems: [],
};

type PublicStorefrontResponse = {
  externalMenu: {
    id: string;
    name: string | null;
  };
  syncedAt: string;
  menu: MenuState;
  error?: string;
};

export function useStorefrontMenu() {
  const [menu, setMenu] = useState<MenuState>(emptyMenu);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/storefront", {
        cache: "no-store",
      });
      const payload = (await response.json()) as PublicStorefrontResponse;

      if (!response.ok || !payload.menu) {
        throw new Error(payload.error || "Не удалось загрузить меню");
      }

      setMenu(payload.menu);
      setError(null);
    } catch (refreshError) {
      setMenu(emptyMenu);
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Не удалось загрузить меню",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchPublicStorefront()
      .then((payload) => {
        if (cancelled) return;
        setMenu(payload.menu);
        setError(null);
      })
      .catch((refreshError: unknown) => {
        if (cancelled) return;
        setMenu(emptyMenu);
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : "Не удалось загрузить меню",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    function handleStorefrontUpdate(event: StorageEvent) {
      if (event.key === "tablo-storefront-updated-at") {
        void refresh();
      }
    }

    function handleFocus() {
      void refresh();
    }

    window.addEventListener("storage", handleStorefrontUpdate);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorefrontUpdate);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refresh]);

  return {
    menu,
    isLoading,
    error,
    refresh,
  };
}

async function fetchPublicStorefront() {
  const response = await fetch("/api/storefront", {
    cache: "no-store",
  });
  const payload = (await response.json()) as PublicStorefrontResponse;

  if (!response.ok || !payload.menu) {
    throw new Error(payload.error || "Не удалось загрузить меню");
  }

  return payload;
}
