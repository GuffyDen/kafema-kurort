"use client";

import { useSyncExternalStore } from "react";

export type BaristaProductType = "drink" | "food";

export type MenuCategory = {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
};

export type MenuProduct = {
  id: string;
  name: string;
  categoryId: string;
  price: number;
  volume: string;
  imageSrc: string;
  baristaType: BaristaProductType;
  isActive: boolean;
  inStock: boolean;
};

export type MenuState = {
  categories: MenuCategory[];
  products: MenuProduct[];
};

type CategoryInput = {
  name: string;
  icon?: string;
};

type ProductInput = {
  name: string;
  categoryId: string;
  price: number;
  volume: string;
  imageSrc: string;
  baristaType: BaristaProductType;
  isActive: boolean;
  inStock: boolean;
};

const storageKey = "kafema-menu-v1";
const channelName = "kafema-menu";

const fallbackImageSrc =
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=85";

export const defaultMenuState: MenuState = {
  categories: [
    { id: "coffee", name: "Кофе", icon: "☕", isActive: true },
    { id: "bakery", name: "Выпечка", icon: "🥐", isActive: true },
    { id: "snacks", name: "Перекусы", icon: "🥪", isActive: true },
    { id: "desserts", name: "Десерты", icon: "🍰", isActive: true },
    { id: "cold-drinks", name: "Холодные напитки", icon: "🥤", isActive: true },
  ],
  products: [
    {
      id: "cappuccino",
      name: "Капучино",
      categoryId: "coffee",
      volume: "300 мл",
      price: 230,
      imageSrc:
        "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=640&q=85",
      baristaType: "drink",
      isActive: true,
      inStock: true,
    },
    {
      id: "latte",
      name: "Латте",
      categoryId: "coffee",
      volume: "350 мл",
      price: 250,
      imageSrc:
        "https://images.unsplash.com/photo-1561882468-9110e03e0f78?auto=format&fit=crop&w=640&q=85",
      baristaType: "drink",
      isActive: true,
      inStock: true,
    },
    {
      id: "americano",
      name: "Американо",
      categoryId: "coffee",
      volume: "250 мл",
      price: 190,
      imageSrc:
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=85",
      baristaType: "drink",
      isActive: true,
      inStock: true,
    },
    {
      id: "raf",
      name: "Раф",
      categoryId: "coffee",
      volume: "300 мл",
      price: 280,
      imageSrc:
        "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=640&q=85",
      baristaType: "drink",
      isActive: true,
      inStock: true,
    },
    {
      id: "flat-white",
      name: "Флэт уайт",
      categoryId: "coffee",
      volume: "250 мл",
      price: 260,
      imageSrc:
        "https://images.unsplash.com/photo-1485808191679-5f86510681a2?auto=format&fit=crop&w=640&q=85",
      baristaType: "drink",
      isActive: true,
      inStock: true,
    },
    {
      id: "cocoa",
      name: "Какао",
      categoryId: "cold-drinks",
      volume: "300 мл",
      price: 240,
      imageSrc:
        "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=640&q=85",
      baristaType: "drink",
      isActive: true,
      inStock: true,
    },
    {
      id: "croissant",
      name: "Круассан",
      categoryId: "bakery",
      volume: "90 г",
      price: 210,
      imageSrc:
        "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=640&q=85",
      baristaType: "food",
      isActive: true,
      inStock: true,
    },
    {
      id: "cheesecake",
      name: "Чизкейк",
      categoryId: "desserts",
      volume: "120 г",
      price: 290,
      imageSrc:
        "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=640&q=85",
      baristaType: "food",
      isActive: true,
      inStock: true,
    },
  ],
};

let menuState = defaultMenuState;
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
    channel.addEventListener("message", (event: MessageEvent<MenuState>) => {
      if (!event.data?.categories || !event.data?.products) {
        return;
      }

      menuState = normalizeMenuState(event.data);
      saveMenu(false);
      notify();
    });
  }

  return channel;
}

function hydrateMenu() {
  if (hydrated || !canUseBrowserStorage()) {
    return;
  }

  hydrated = true;

  const savedMenu = localStorage.getItem(storageKey);

  if (!savedMenu) {
    saveMenu(false);
    return;
  }

  try {
    const parsedMenu = JSON.parse(savedMenu) as MenuState;

    if (Array.isArray(parsedMenu.categories) && Array.isArray(parsedMenu.products)) {
      menuState = normalizeMenuState(parsedMenu);
    }
  } catch {
    menuState = defaultMenuState;
    saveMenu(false);
  }
}

function saveMenu(shouldBroadcast = true) {
  if (!canUseBrowserStorage()) {
    return;
  }

  localStorage.setItem(storageKey, JSON.stringify(menuState));

  if (shouldBroadcast) {
    getChannel()?.postMessage(menuState);
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setMenuState(nextState: MenuState) {
  menuState = nextState;
  saveMenu();
  notify();
}

function getSnapshot() {
  hydrateMenu();
  return menuState;
}

function getServerSnapshot() {
  return defaultMenuState;
}

function subscribe(listener: () => void) {
  hydrateMenu();
  getChannel();
  listeners.add(listener);

  function syncStorage(event: StorageEvent) {
    if (event.key !== storageKey || !event.newValue) {
      return;
    }

    try {
      menuState = JSON.parse(event.newValue) as MenuState;
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

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function withSafeProduct(input: ProductInput): ProductInput {
  return {
    ...input,
    name: input.name.trim(),
    volume: input.volume.trim(),
    imageSrc: input.imageSrc.trim() || fallbackImageSrc,
    price: Math.max(0, Number(input.price) || 0),
  };
}

function normalizeMenuState(state: MenuState) {
  return {
    categories: state.categories,
    products: state.products.map((product) => normalizeProduct(product)),
  };
}

function normalizeProduct(product: MenuProduct | (MenuProduct & { image?: string })) {
  return {
    ...product,
    imageSrc:
      product.imageSrc ||
      ("image" in product && typeof product.image === "string"
        ? product.image
        : fallbackImageSrc),
  };
}

export function addCategory(input: CategoryInput) {
  hydrateMenu();
  const category: MenuCategory = {
    id: createId("category"),
    name: input.name.trim(),
    icon: input.icon?.trim() || "•",
    isActive: true,
  };

  if (!category.name) {
    return;
  }

  setMenuState({
    ...menuState,
    categories: [...menuState.categories, category],
  });
}

export function updateCategory(
  categoryId: string,
  updates: Partial<Pick<MenuCategory, "name" | "icon" | "isActive">>,
) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    categories: menuState.categories.map((category) =>
      category.id === categoryId
        ? {
            ...category,
            ...updates,
            name: updates.name?.trim() || category.name,
            icon: updates.icon?.trim() || category.icon,
          }
        : category,
    ),
  });
}

export function addProduct(input: ProductInput) {
  hydrateMenu();
  const safeProduct = withSafeProduct(input);

  if (!safeProduct.name) {
    return;
  }

  setMenuState({
    ...menuState,
    products: [
      ...menuState.products,
      {
        ...safeProduct,
        id: createId("product"),
      },
    ],
  });
}

export function updateProduct(productId: string, updates: Partial<ProductInput>) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    products: menuState.products.map((product) => {
      if (product.id !== productId) {
        return product;
      }

      const nextProduct = withSafeProduct({
        ...product,
        ...updates,
      });

      return {
        ...product,
        ...nextProduct,
      };
    }),
  });
}

export function useMenu() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
