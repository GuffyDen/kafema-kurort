"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OrderSuccessModal } from "@/components/OrderSuccessModal";
import type { ClientJourneyStatus } from "@/components/OrderStatusTimeline";
import type { Order } from "@/lib/orderStore";

const previewOrder: Order = {
  id: "preview-order-725",
  number: "725",
  customerName: "Гость",
  phone: "+7 (914) 234-56-78",
  createdAt: "10:24",
  statusChangedAt: Date.now(),
  status: "ready",
  items: [
    {
      id: "cappuccino",
      name: "Капучино",
      volume: "350 мл",
      modifiers: ["Овсяное молоко", "Сироп ваниль", "Без сахара"],
      baristaType: "drink",
      quantity: 1,
    },
    {
      id: "croissant",
      name: "Круассан",
      volume: "90 г",
      modifiers: ["Подогреть"],
      baristaType: "food",
      quantity: 1,
    },
  ],
};

const previewStatuses = new Set<ClientJourneyStatus>([
  "PAID",
  "QUEUED",
  "IN_PROGRESS",
  "READY",
]);

export default function OrderStatusPreviewPage() {
  const router = useRouter();
  const [previewStatus] = useState<ClientJourneyStatus>(() => getPreviewStatus());

  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-cream)] px-5 text-center text-[var(--color-text-main)]">
        <section className="max-w-sm rounded-[var(--radius-xxl)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-soft)]">
          <h1 className="text-2xl font-black">Статус заказа</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-text-muted)]">
            Демо-экран статуса доступен только в режиме разработки.
          </p>
          <button
            type="button"
            className="mt-5 inline-flex h-12 items-center justify-center rounded-[24px] bg-[var(--color-caramel)] px-5 font-black text-white"
            onClick={() => router.push("/")}
          >
            Вернуться в меню
          </button>
        </section>
      </main>
    );
  }

  return (
    <OrderSuccessModal
      journeyStatusOverride={previewStatus}
      order={previewOrder}
      onBackToMenu={() => router.push("/")}
    />
  );
}

function getPreviewStatus(): ClientJourneyStatus {
  if (typeof window === "undefined") {
    return "READY";
  }

  const status = new URLSearchParams(window.location.search).get("status");

  if (previewStatuses.has(status as ClientJourneyStatus)) {
    return status as ClientJourneyStatus;
  }

  return "READY";
}
