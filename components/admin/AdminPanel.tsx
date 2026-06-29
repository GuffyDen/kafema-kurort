"use client";

import { useMemo } from "react";
import {
  updateOrderStatus,
  useOrders,
  type Order,
  type OrderStatus,
} from "@/lib/orderStore";

type BoardStatus = Exclude<OrderStatus, "completed">;

type BoardColumn = {
  status: BoardStatus;
  title: string;
  subtitle: string;
  accent: string;
  badge: string;
  button: {
    label: string;
    nextStatus: OrderStatus;
    className: string;
  };
};

const boardColumns: BoardColumn[] = [
  {
    status: "new",
    title: "Новые",
    subtitle: "Только поступили",
    accent: "bg-[#E30613]/8",
    badge: "bg-[#E30613]/10 text-[#E30613]",
    button: {
      label: "Принять",
      nextStatus: "in_progress",
      className: "bg-[#E30613] text-white shadow-[0_16px_32px_rgba(227,6,19,0.2)]",
    },
  },
  {
    status: "in_progress",
    title: "В работе",
    subtitle: "Готовятся сейчас",
    accent: "bg-[#F5D06F]/18",
    badge: "bg-[#F5D06F]/24 text-[#8A6500]",
    button: {
      label: "Готов",
      nextStatus: "ready",
      className: "bg-[#1A1A1A] text-white shadow-[0_16px_32px_rgba(26,26,26,0.14)]",
    },
  },
  {
    status: "ready",
    title: "Готовы",
    subtitle: "Ждут выдачи",
    accent: "bg-emerald-500/10",
    badge: "bg-emerald-500/10 text-emerald-700",
    button: {
      label: "Выдан",
      nextStatus: "completed",
      className: "bg-emerald-600 text-white shadow-[0_16px_32px_rgba(5,150,105,0.18)]",
    },
  },
];

export function AdminPanel() {
  const orders = useOrders();
  const visibleOrders = orders.filter((order) => order.status !== "completed");

  const stats = useMemo(
    () =>
      boardColumns.reduce<Record<BoardStatus, number>>(
        (acc, column) => {
          acc[column.status] = visibleOrders.filter(
            (order) => order.status === column.status,
          ).length;
          return acc;
        },
        { new: 0, in_progress: 0, ready: 0 },
      ),
    [visibleOrders],
  );

  return (
    <main className="min-h-screen bg-[#F7F7F7] px-6 py-6 text-[#1A1A1A] lg:px-8">
      <div className="mx-auto flex h-full min-h-[calc(100vh-48px)] w-full max-w-7xl flex-col gap-6">
        <header className="flex shrink-0 items-center justify-between gap-8">
          <div>
            <p className="text-3xl font-bold leading-none text-[#E30613]">
              ☕ Кафема Курорт
            </p>
            <h1 className="mt-2 text-2xl font-bold leading-tight">Заказы</h1>
          </div>

          <div className="flex items-center gap-3 rounded-[28px] bg-white p-3 shadow-[0_18px_45px_rgba(26,26,26,0.06)]">
            <Counter label="Новые" value={stats.new} dot="bg-[#E30613]" />
            <Counter
              label="В работе"
              value={stats.in_progress}
              dot="bg-[#F5BD1F]"
            />
            <Counter label="Готовы" value={stats.ready} dot="bg-emerald-500" />
          </div>
        </header>

        <section className="grid min-h-0 flex-1 grid-cols-3 gap-5">
          {boardColumns.map((column) => (
            <OrderColumn
              key={column.status}
              column={column}
              orders={visibleOrders.filter(
                (order) => order.status === column.status,
              )}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function Counter({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot: string;
}) {
  return (
    <div className="flex min-w-32 items-center gap-3 rounded-2xl px-4 py-3">
      <span className={`size-3 rounded-full ${dot}`} />
      <span className="text-base font-bold">
        {label} — {value}
      </span>
    </div>
  );
}

function OrderColumn({
  column,
  orders,
}: {
  column: BoardColumn;
  orders: Order[];
}) {
  return (
    <article className="flex min-h-0 flex-col rounded-[32px] bg-white/58 p-4 shadow-[0_18px_45px_rgba(26,26,26,0.04)]">
      <div className={`rounded-[26px] px-5 py-4 ${column.accent}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{column.title}</h2>
            <p className="mt-1 text-base font-semibold text-[#777777]">
              {column.subtitle}
            </p>
          </div>
          <span
            className={`rounded-full px-4 py-2 text-base font-bold ${column.badge}`}
          >
            {orders.length}
          </span>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {orders.length > 0 ? (
          orders.map((order) => (
            <OrderCard key={order.id} order={order} column={column} />
          ))
        ) : (
          <div className="flex min-h-44 items-center justify-center rounded-[28px] border border-dashed border-[#E8E8E8] bg-white px-6 text-center text-base font-semibold text-[#777777]">
            Заказов нет
          </div>
        )}
      </div>
    </article>
  );
}

function OrderCard({
  order,
  column,
}: {
  order: Order;
  column: BoardColumn;
}) {
  return (
    <article className="rounded-[28px] bg-white p-5 shadow-[0_18px_40px_rgba(26,26,26,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-[#777777]">Заказ</p>
          <h3 className="mt-1 text-4xl font-bold leading-none">
            №{order.number}
          </h3>
        </div>
        <span className="rounded-full bg-[#F7F7F7] px-4 py-2 text-base font-bold text-[#777777]">
          {order.createdAt}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 rounded-[22px] bg-[#F7F7F7] p-4">
        <div>
          <p className="text-sm font-semibold text-[#777777]">Клиент</p>
          <p className="mt-1 text-xl font-bold">{order.customerName}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#777777]">Телефон</p>
          <p className="mt-1 text-lg font-bold">{order.phone}</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-[#777777]">Состав заказа</p>
        <ul className="mt-3 flex flex-col gap-2">
          {order.items.map((item) => (
            <li
              key={`${order.id}-${item.id}`}
              className="flex items-start justify-between gap-4 text-base"
            >
              <span className="font-semibold leading-snug">
                {item.name} {item.volume}
              </span>
              <span className="shrink-0 rounded-full bg-[#F7F7F7] px-3 py-1 font-bold">
                x{item.quantity}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {order.comment ? (
        <div className="mt-5 rounded-[22px] border border-[#EFEFEF] p-4">
          <p className="text-sm font-semibold text-[#777777]">Комментарий</p>
          <p className="mt-2 text-base font-semibold leading-snug">
            {order.comment}
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => updateOrderStatus(order.id, column.button.nextStatus)}
        className={`mt-5 min-h-14 w-full rounded-[22px] px-5 text-lg font-bold transition active:scale-[0.98] ${column.button.className}`}
      >
        {column.button.label}
      </button>
    </article>
  );
}
