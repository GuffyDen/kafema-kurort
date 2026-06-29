"use client";

import { useSyncExternalStore } from "react";

export type OrderStatus = "new" | "in_progress" | "ready" | "completed";

export type OrderItem = {
  id: string;
  name: string;
  volume: string;
  baristaType?: "drink" | "food";
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
};

type CreateOrderInput = {
  customerName: string;
  phone: string;
  comment?: string;
  items: OrderItem[];
};

const storageKey = "kafema-orders-v1";
const channelName = "kafema-orders";

const initialOrders: Order[] = [
  {
    id: "order-001",
    number: "001",
    customerName: "Анна",
    phone: "+7 (914) 234-56-78",
    createdAt: "09:42",
    items: [
      {
        id: "cappuccino",
        name: "Капучино",
        volume: "300 мл",
        baristaType: "drink",
        quantity: 2,
      },
      {
        id: "croissant",
        name: "Круассан",
        volume: "90 г",
        baristaType: "food",
        quantity: 1,
      },
    ],
    comment: "Один капучино без сахара",
    status: "new",
  },
  {
    id: "order-002",
    number: "002",
    customerName: "Денис",
    phone: "+7 (924) 112-45-90",
    createdAt: "09:48",
    items: [
      {
        id: "latte",
        name: "Латте",
        volume: "350 мл",
        baristaType: "drink",
        quantity: 1,
      },
      {
        id: "cheesecake",
        name: "Чизкейк",
        volume: "120 г",
        baristaType: "food",
        quantity: 1,
      },
    ],
    status: "in_progress",
  },
  {
    id: "order-003",
    number: "003",
    customerName: "Мария",
    phone: "+7 (914) 987-65-43",
    createdAt: "09:55",
    items: [
      {
        id: "raf",
        name: "Раф",
        volume: "300 мл",
        baristaType: "drink",
        quantity: 1,
      },
      {
        id: "americano",
        name: "Американо",
        volume: "250 мл",
        baristaType: "drink",
        quantity: 1,
      },
    ],
    comment: "Раф погорячее",
    status: "new",
  },
  {
    id: "order-004",
    number: "004",
    customerName: "Илья",
    phone: "+7 (902) 555-31-20",
    createdAt: "10:01",
    items: [
      {
        id: "flat-white",
        name: "Флэт уайт",
        volume: "250 мл",
        baristaType: "drink",
        quantity: 2,
      },
      {
        id: "cocoa",
        name: "Какао",
        volume: "300 мл",
        baristaType: "drink",
        quantity: 1,
      },
    ],
    status: "ready",
  },
];

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

  if (!savedOrders) {
    saveOrders(false);
    return;
  }

  try {
    const parsedOrders = JSON.parse(savedOrders) as Order[];

    if (Array.isArray(parsedOrders)) {
      orders = parsedOrders;
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
