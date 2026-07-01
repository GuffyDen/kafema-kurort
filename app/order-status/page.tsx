"use client";

import { useRouter } from "next/navigation";
import { OrderSuccessModal } from "@/components/OrderSuccessModal";
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

export default function OrderStatusPreviewPage() {
  const router = useRouter();

  return (
    <OrderSuccessModal
      order={previewOrder}
      onBackToMenu={() => router.push("/")}
    />
  );
}
