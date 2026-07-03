"use client";

import { useEffect, useMemo, useState } from "react";
import {
  updateOrderStatus,
  useOrders,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@/lib/orderStore";

type BoardStatus = Exclude<OrderStatus, "completed">;

type BoardColumn = {
  status: BoardStatus;
  title: string;
  strip: string;
  dot: string;
  badge: string;
  actionLabel: string;
  nextStatus: OrderStatus;
};

type TimerTone = "neutral" | "warning" | "danger";

const boardColumns: BoardColumn[] = [
  {
    status: "new",
    title: "Новые",
    strip: "bg-[#E30613]",
    dot: "bg-[#E30613]",
    badge: "bg-[#E30613]/10 text-[#E30613]",
    actionLabel: "Принять",
    nextStatus: "in_progress",
  },
  {
    status: "in_progress",
    title: "В работе",
    strip: "bg-[#F5BD1F]",
    dot: "bg-[#F5BD1F]",
    badge: "bg-[#F5BD1F]/18 text-[#8A6500]",
    actionLabel: "Готов",
    nextStatus: "ready",
  },
  {
    status: "ready",
    title: "Готовы",
    strip: "bg-emerald-500",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-700",
    actionLabel: "Выдан",
    nextStatus: "completed",
  },
];

const timerThresholds: Record<BoardStatus, { warning: number; danger: number }> =
  {
    new: { warning: 60, danger: 120 },
    in_progress: { warning: 5 * 60, danger: 7 * 60 },
    ready: { warning: 3 * 60, danger: 10 * 60 },
  };

export function AdminPanel() {
  const orders = useOrders();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const visibleOrders = orders.filter(
    (order) =>
      order.status !== "completed" &&
      !isSeedOrder(order) &&
      !isDemoOrder(order),
  );

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
    <main className="min-h-screen bg-[#F7F7F7] px-6 py-5 text-[#1A1A1A] lg:px-8">
      <div className="mx-auto flex h-full min-h-[calc(100vh-40px)] w-full max-w-7xl flex-col gap-5">
        <header className="flex shrink-0 items-center justify-between gap-8">
          <div>
            <p className="text-3xl font-bold leading-none text-[#E30613]">
              ☕ Кафема Курорт
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-[24px] bg-white px-3 py-2 shadow-[0_14px_34px_rgba(26,26,26,0.06)]">
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
              now={now}
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
    <div className="flex min-w-28 items-center gap-2 rounded-2xl px-3 py-2">
      <span className={`size-2.5 rounded-full ${dot}`} />
      <span className="text-sm font-bold">
        {label} — {value}
      </span>
    </div>
  );
}

function OrderColumn({
  column,
  orders,
  now,
}: {
  column: BoardColumn;
  orders: Order[];
  now: number;
}) {
  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-[30px] bg-[#FCFCFC] shadow-[0_18px_42px_rgba(26,26,26,0.05)]">
      <div className={`h-1.5 w-full ${column.strip}`} />

      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className={`size-3 rounded-full ${column.dot}`} />
          <h2 className="text-xl font-bold">{column.title}</h2>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${column.badge}`}
        >
          {orders.length}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
        {orders.length > 0 ? (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              column={column}
              now={now}
            />
          ))
        ) : (
          <div className="flex min-h-36 items-center justify-center rounded-[24px] border border-dashed border-[#E8E8E8] bg-white px-5 text-center text-sm font-semibold text-[#777777]">
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
  now,
}: {
  order: Order;
  column: BoardColumn;
  now: number;
}) {
  const elapsedSeconds = getElapsedSeconds(order, now);
  const timerTone = getTimerTone(column.status, elapsedSeconds);
  const groupedItems = groupOrderItems(order.items);
  const isReadyColumn = column.status === "ready";

  return (
    <article className="rounded-[24px] bg-white p-4 shadow-[0_12px_30px_rgba(26,26,26,0.08)]">
      <span data-order-source-slot className="hidden" aria-hidden="true" />

      {isReadyColumn ? (
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-4xl font-bold leading-none tracking-normal text-[#1A1A1A]">
            #{order.number}
          </h3>
          <StageTimer elapsedSeconds={elapsedSeconds} tone={timerTone} />
        </div>
      ) : null}

      {!isReadyColumn ? (
        <OrderZones
          groupedItems={groupedItems}
          compact={false}
          plain={false}
        />
      ) : null}

      {order.comment && !isReadyColumn ? (
        <div className="mt-3 rounded-[18px] border border-[#EFEFEF] px-3.5 py-3">
          <p className="text-xs font-semibold text-[#777777]">
            💬 Комментарий
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug">
            {order.comment}
          </p>
        </div>
      ) : null}

      <div
        className={
          isReadyColumn
            ? "mt-3 px-0 py-0"
            : "mt-4 border-t border-[#EFEFEF] pt-3"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {!isReadyColumn ? (
              <p className="text-base font-semibold leading-none text-[#777777]">
                #{order.number}
              </p>
            ) : null}
            <p
              className={
                isReadyColumn
                  ? "text-base font-bold leading-snug"
                  : "mt-2 text-sm font-bold leading-snug"
              }
            >
              {order.customerName}
            </p>
            <p className="mt-0.5 text-xs font-medium text-[#777777]">
              {order.phone}
            </p>
          </div>
          {!isReadyColumn ? (
            <StageTimer elapsedSeconds={elapsedSeconds} tone={timerTone} />
          ) : null}
        </div>
      </div>

      {isReadyColumn ? (
        <OrderZones groupedItems={groupedItems} compact={true} plain={true} />
      ) : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => updateOrderStatus(order.id, column.nextStatus)}
          className="min-h-11 rounded-[18px] bg-[#E30613] px-6 text-base font-bold text-white shadow-[0_12px_24px_rgba(227,6,19,0.2)]"
        >
          {column.actionLabel}
        </button>
      </div>
    </article>
  );
}

function OrderZones({
  groupedItems,
  compact,
  plain,
}: {
  groupedItems: { drinks: OrderItem[]; food: OrderItem[] };
  compact: boolean;
  plain: boolean;
}) {
  return (
    <div
      className={
        plain
          ? "mt-3 space-y-2"
          : "space-y-3 divide-y divide-[#EFEFEF]"
      }
    >
      {groupedItems.drinks.length > 0 ? (
        <OrderItemsGroup
          icon="☕"
          label="Напитки"
          items={groupedItems.drinks}
          compact={compact}
          plain={plain}
        />
      ) : null}

      {groupedItems.food.length > 0 ? (
        <OrderItemsGroup
          icon="🥐"
          label="Еда"
          items={groupedItems.food}
          compact={compact}
          plain={plain}
        />
      ) : null}
    </div>
  );
}

function StageTimer({
  elapsedSeconds,
  tone,
}: {
  elapsedSeconds: number;
  tone: TimerTone;
}) {
  const toneClass =
    tone === "danger"
      ? "bg-[#E30613]/10 text-[#E30613]"
      : tone === "warning"
        ? "bg-[#F5BD1F]/20 text-[#8A6500]"
        : "bg-[#F7F7F7] text-[#777777]";

  return (
    <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${toneClass}`}>
      {formatElapsed(elapsedSeconds)}
    </span>
  );
}

function OrderItemsGroup({
  icon,
  label,
  items,
  compact = false,
  plain = false,
}: {
  icon: string;
  label: string;
  items: OrderItem[];
  compact?: boolean;
  plain?: boolean;
}) {
  return (
    <section className="pt-3 first:pt-0">
      <div className="flex items-center gap-2">
        <span className={compact ? "text-base leading-none" : "text-lg leading-none"}>
          {icon}
        </span>
        <p className="text-xs font-bold text-[#777777]">{label}</p>
      </div>
      <ul className={compact ? "mt-1.5 space-y-1.5" : "mt-2 space-y-2"}>
        {items.map((item, index) => (
          <li
            key={`${item.id}-${item.name}-${index}`}
            className={`${
              plain ? "px-0 py-0.5 text-xs" : "px-0 py-1.5 text-base"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#E30613]" />
                <span className="min-w-0">
                  <span
                    className={`block truncate leading-snug ${
                      plain ? "font-semibold" : "font-bold"
                    }`}
                  >
                    {item.name} {item.volume}
                  </span>
                  {item.modifiers?.length ? (
                    <span className="mt-1 block space-y-0.5">
                      {item.modifiers.map((modifier, modifierIndex) => (
                        <span
                          className="block truncate text-xs font-semibold text-[#777777]"
                          key={`${modifier}-${modifierIndex}`}
                        >
                          • {modifier}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 text-xs font-bold text-[#1A1A1A] ${
                  plain ? "bg-[#F7F7F7] py-0.5" : "bg-white py-1"
                }`}
              >
                ×{item.quantity}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function groupOrderItems(items: OrderItem[]) {
  return items.reduce(
    (groups, item) => {
      if (classifyOrderItem(item) === "drink") {
        groups.drinks.push(item);
      } else {
        groups.food.push(item);
      }

      return groups;
    },
    { drinks: [] as OrderItem[], food: [] as OrderItem[] },
  );
}

function classifyOrderItem(item: OrderItem): "drink" | "food" {
  const searchableValue = normalizeSearch(
    [
      item.id,
      item.name,
      item.volume,
      item.categoryId ?? "",
      item.categoryName ?? "",
      item.workingZoneId ?? "",
      item.type ?? "",
    ].join(" "),
  );

  if (
    item.baristaType === "drink" ||
    hasDrinkSignal(searchableValue)
  ) {
    return "drink";
  }

  if (
    item.baristaType === "food" ||
    hasFoodSignal(searchableValue)
  ) {
    return "food";
  }

  return "food";
}

function hasDrinkSignal(value: string) {
  return [
    "bar",
    "cold",
    "drink",
    "coffee",
    "beverage",
    "напит",
    "кофе",
    "капучино",
    "латте",
    "американо",
    "раф",
    "какао",
    "флэт",
    "flat",
    "чай",
    "матча",
    "лимонад",
    "эспрессо",
    "мокко",
    "айс",
  ].some((keyword) => value.includes(keyword));
}

function hasFoodSignal(value: string) {
  return [
    "food",
    "kitchen",
    "showcase",
    "bakery",
    "snack",
    "dessert",
    "кух",
    "витрин",
    "еда",
    "выпеч",
    "перекус",
    "десерт",
    "круассан",
    "сэндвич",
    "сендвич",
    "чизкейк",
    "торт",
    "булоч",
    "печень",
  ].some((keyword) => value.includes(keyword));
}

function getElapsedSeconds(order: Order, now: number) {
  if (isSeedOrder(order) && !order.statusChangedAt) {
    return 0;
  }

  const startedAt = order.statusChangedAt ?? parseCreatedAt(order.createdAt, now);

  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

function isSeedOrder(order: Order) {
  return /^order-00\d+$/.test(order.id);
}

function isDemoOrder(order: Order) {
  const values = [
    order.id,
    order.number,
    order.customerName,
    order.comment ?? "",
    ...order.items.flatMap((item) => [item.id, item.name, item.volume, ...(item.modifiers ?? [])]),
  ]
    .join(" ")
    .toLowerCase();

  return (
    values.includes("test") ||
    values.includes("demo") ||
    values.includes("тест") ||
    values.includes("проверка menu engine")
  );
}

function parseCreatedAt(createdAt: string, now: number) {
  const [hours, minutes] = createdAt.split(":").map(Number);
  const date = new Date(now);

  date.setHours(Number.isFinite(hours) ? hours : 0);
  date.setMinutes(Number.isFinite(minutes) ? minutes : 0);
  date.setSeconds(0);
  date.setMilliseconds(0);

  if (date.getTime() > now) {
    date.setDate(date.getDate() - 1);
  }

  return date.getTime();
}

function getTimerTone(status: BoardStatus, elapsedSeconds: number): TimerTone {
  const threshold = timerThresholds[status];

  if (elapsedSeconds > threshold.danger) {
    return "danger";
  }

  if (elapsedSeconds >= threshold.warning) {
    return "warning";
  }

  return "neutral";
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    return `${hours} ч ${restMinutes} мин`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}
