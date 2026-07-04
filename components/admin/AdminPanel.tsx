"use client";

import { useEffect, useMemo, useState } from "react";
import {
  updateOrderStatus,
  useOrders,
  type Order,
  type OrderItem,
  type OrderStatus,
} from "@/lib/orderStore";
import {
  baristaSettingsStorageKey,
  getStoredBaristaSettings,
  type BaristaCardSize,
} from "@/lib/baristaSettings";
import { addDays, getLocalDateKey } from "@/lib/dateUtils";

type BoardStatus = Exclude<OrderStatus, "completed">;
type BarView = "queue" | "archive";

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
  const [activeView, setActiveView] = useState<BarView>("queue");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveDate, setArchiveDate] = useState(() => getLocalDateKey(new Date()));
  const [now, setNow] = useState(() => Date.now());
  const [cardSize, setCardSize] = useState<BaristaCardSize>(
    () => getStoredBaristaSettings().cardSize,
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key === baristaSettingsStorageKey) {
        setCardSize(getStoredBaristaSettings().cardSize);
      }
    }

    window.addEventListener("storage", handleStorageChange);

    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const visibleOrders = orders.filter(
    (order) =>
      order.status !== "completed" &&
      !isSeedOrder(order) &&
      !isDemoOrder(order),
  );
  const completedOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.status === "completed" &&
            !isSeedOrder(order) &&
            !isDemoOrder(order),
        )
        .reverse(),
    [orders],
  );
  const completedOrdersByDate = useMemo(
    () => filterOrdersByArchiveDate(completedOrders, archiveDate),
    [archiveDate, completedOrders],
  );
  const archiveOrders = useMemo(
    () => filterArchiveOrders(completedOrdersByDate, archiveSearch),
    [archiveSearch, completedOrdersByDate],
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
          <div className="flex items-center gap-4">
            <p className="text-3xl font-bold leading-none text-[#E30613]">
              ☕ Кафема Курорт
            </p>
            <div className="flex rounded-[22px] bg-white p-1 shadow-[0_14px_34px_rgba(26,26,26,0.06)]">
              {(["queue", "archive"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`min-h-10 rounded-[18px] px-4 text-sm font-bold transition ${
                    activeView === view
                      ? "bg-[#E30613] text-white"
                      : "text-[#777777] hover:bg-[#F7F7F7]"
                  }`}
                  onClick={() => setActiveView(view)}
                >
                  {view === "queue" ? "Очередь" : "Архив"}
                </button>
              ))}
            </div>
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

        {activeView === "queue" ? (
          <section className="grid min-h-0 flex-1 grid-cols-3 gap-5">
            {boardColumns.map((column) => (
              <OrderColumn
                key={column.status}
                column={column}
                cardSize={cardSize}
                now={now}
                orders={visibleOrders.filter(
                  (order) => order.status === column.status,
                )}
              />
            ))}
          </section>
        ) : (
          <ArchiveView
            archiveDate={archiveDate}
            cardSize={cardSize}
            orders={archiveOrders}
            search={archiveSearch}
            selectedDateCount={completedOrdersByDate.length}
            onDateChange={setArchiveDate}
            onSearch={setArchiveSearch}
          />
        )}
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
  cardSize,
  column,
  orders,
  now,
}: {
  cardSize: BaristaCardSize;
  column: BoardColumn;
  orders: Order[];
  now: number;
}) {
  const size = getCardSizeClasses(cardSize);

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

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 ${size.columnGap}`}
      >
        {orders.length > 0 ? (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              cardSize={cardSize}
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
  cardSize,
  order,
  column,
  now,
}: {
  cardSize: BaristaCardSize;
  order: Order;
  column: BoardColumn;
  now: number;
}) {
  const elapsedSeconds = getElapsedSeconds(order, now);
  const timerTone = getTimerTone(column.status, elapsedSeconds);
  const groupedItems = groupOrderItems(order.items);
  const isReadyColumn = column.status === "ready";
  const size = getCardSizeClasses(cardSize);

  return (
    <article
      className={`rounded-[24px] bg-white shadow-[0_12px_30px_rgba(26,26,26,0.08)] ${size.cardPadding}`}
    >
      <span data-order-source-slot className="hidden" aria-hidden="true" />

      {isReadyColumn ? (
        <div className="flex items-start justify-between gap-3">
          <h3
            className={`${size.readyNumber} font-bold leading-none tracking-normal text-[#1A1A1A]`}
          >
            #{order.number}
          </h3>
          <StageTimer elapsedSeconds={elapsedSeconds} tone={timerTone} />
        </div>
      ) : null}

      {!isReadyColumn ? (
        <OrderZones
          groupedItems={groupedItems}
          cardSize={cardSize}
          compact={false}
          plain={false}
        />
      ) : null}

      {order.comment && !isReadyColumn ? (
        <div
          className={`rounded-[18px] border border-[#EFEFEF] px-3.5 ${size.commentPadding}`}
        >
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
            : `${size.footerMargin} border-t border-[#EFEFEF] ${size.footerPadding}`
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
                  ? `${size.customerText} font-bold leading-snug`
                  : `${size.customerMargin} ${size.metaText} font-bold leading-snug`
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
        <OrderZones
          groupedItems={groupedItems}
          cardSize={cardSize}
          compact={true}
          plain={true}
        />
      ) : null}

      <div className={`${size.actionMargin} flex justify-end`}>
        <button
          type="button"
          onClick={() => updateOrderStatus(order.id, column.nextStatus)}
          className={`${size.actionButton} rounded-[18px] bg-[#E30613] font-bold text-white shadow-[0_12px_24px_rgba(227,6,19,0.2)]`}
        >
          {column.actionLabel}
        </button>
      </div>
    </article>
  );
}

function ArchiveView({
  archiveDate,
  cardSize,
  onDateChange,
  onSearch,
  orders,
  search,
  selectedDateCount,
}: {
  archiveDate: string;
  cardSize: BaristaCardSize;
  onDateChange: (value: string) => void;
  onSearch: (value: string) => void;
  orders: Order[];
  search: string;
  selectedDateCount: number;
}) {
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const todayKey = getLocalDateKey(new Date());
  const yesterdayKey = getLocalDateKey(addDays(new Date(), -1));

  function toggleExpandedOrder(orderId: string) {
    setExpandedOrderIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(orderId)) {
        nextIds.delete(orderId);
      } else {
        nextIds.add(orderId);
      }

      return nextIds;
    });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-[30px] bg-[#FCFCFC] shadow-[0_18px_42px_rgba(26,26,26,0.05)]">
      <div className="flex shrink-0 items-start justify-between gap-5 border-b border-[#EFEFEF] px-5 py-4">
        <div>
          <h2 className="text-2xl font-bold">Архив</h2>
          <p className="mt-1 text-sm font-semibold text-[#777777]">
            Выданные заказы за {formatArchiveDateLabel(archiveDate)}:{" "}
            {selectedDateCount}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ArchiveDateButton
              active={archiveDate === todayKey}
              label="Сегодня"
              onClick={() => onDateChange(todayKey)}
            />
            <ArchiveDateButton
              active={archiveDate === yesterdayKey}
              label="Вчера"
              onClick={() => onDateChange(yesterdayKey)}
            />
            <label className="flex h-10 items-center rounded-[18px] border border-[#E8E8E8] bg-white px-3 text-sm font-bold text-[#777777]">
              <span className="mr-2">Выбрать дату</span>
              <input
                className="bg-transparent font-bold text-[#1A1A1A] outline-none"
                type="date"
                value={archiveDate}
                onChange={(event) => onDateChange(event.target.value)}
              />
            </label>
          </div>
        </div>
        <label className="w-full max-w-sm pt-1">
          <span className="sr-only">Поиск по архиву</span>
          <input
            className="h-12 w-full rounded-[20px] border border-[#E8E8E8] bg-white px-4 text-sm font-semibold outline-none transition focus:border-[#E30613]"
            placeholder="Поиск по номеру, имени или телефону"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {selectedDateCount === 0 ? (
          <ArchiveEmptyState selectedDate={archiveDate} />
        ) : orders.length > 0 ? (
          <div className="space-y-2">
            {orders.map((order) => (
              <ArchiveOrderRow
                key={order.id}
                cardSize={cardSize}
                isExpanded={expandedOrderIds.has(order.id)}
                order={order}
                onToggle={() => toggleExpandedOrder(order.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-52 items-center justify-center rounded-[24px] border border-dashed border-[#E8E8E8] bg-white px-5 text-center text-sm font-semibold text-[#777777]">
            По этому запросу заказов не найдено
          </div>
        )}
      </div>
    </section>
  );
}

function ArchiveDateButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`h-10 rounded-[18px] px-4 text-sm font-bold transition ${
        active ? "bg-[#E30613] text-white" : "bg-white text-[#777777] hover:bg-[#F7F7F7]"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ArchiveEmptyState({ selectedDate }: { selectedDate: string }) {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-[28px] border border-dashed border-[#E8E8E8] bg-white px-5 text-center">
      <div>
        <p className="text-2xl font-bold">
          За выбранный день выданных заказов нет.
        </p>
        <p className="mt-2 text-sm font-semibold text-[#777777]">
          {formatArchiveDateLabel(selectedDate)}
        </p>
      </div>
    </div>
  );
}

function ArchiveOrderRow({
  cardSize,
  isExpanded,
  onToggle,
  order,
}: {
  cardSize: BaristaCardSize;
  isExpanded: boolean;
  onToggle: () => void;
  order: Order;
}) {
  const groupedItems = groupOrderItems(order.items);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <article className="overflow-hidden rounded-[22px] bg-white shadow-[0_10px_24px_rgba(26,26,26,0.05)]">
      <button
        type="button"
        className="grid w-full grid-cols-[92px_82px_minmax(140px,1fr)_minmax(132px,0.9fr)_110px_94px_94px_28px] items-center gap-3 px-4 py-3 text-left text-sm font-semibold transition hover:bg-[#F7F7F7]"
        onClick={onToggle}
      >
        <span className="text-lg font-bold">#{order.number}</span>
        <span className="text-[#777777]">
          {formatArchiveShortTime(order.completedAt ?? order.statusChangedAt)}
        </span>
        <span className="truncate font-bold">{order.customerName}</span>
        <span className="truncate text-[#777777]">{formatCompactPhone(order.phone)}</span>
        <span className="text-[#777777]">{formatItemCount(itemCount)}</span>
        <span className="font-bold">{formatMoney(order.total)}</span>
        <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1 text-center text-xs font-bold text-[#777777]">
          {formatOrderSource(order.source)}
        </span>
        <span className="text-right text-lg text-[#777777]">
          {isExpanded ? "−" : "+"}
        </span>
      </button>

      {isExpanded ? (
        <div className="border-t border-[#EFEFEF] px-4 py-4">
          <div className="grid gap-3 md:grid-cols-3">
            <ArchiveMeta label="Создан" value={formatArchiveTime(order.createdAt)} />
            <ArchiveMeta
              label="Выдан"
              value={formatArchiveTime(order.completedAt ?? order.statusChangedAt)}
            />
            <ArchiveMeta label="Итог" value={formatMoney(order.total)} />
          </div>

          <div className="mt-4 rounded-[20px] border border-[#EFEFEF] px-4 py-3">
            <p className="text-sm font-bold">{order.customerName}</p>
            <p className="mt-1 text-xs font-semibold text-[#777777]">{order.phone}</p>
          </div>

          <OrderZones
            groupedItems={groupedItems}
            cardSize={cardSize}
            compact={false}
            plain={false}
          />

          {order.comment ? (
            <div className="mt-4 rounded-[18px] border border-[#EFEFEF] px-3.5 py-3">
              <p className="text-xs font-semibold text-[#777777]">💬 Комментарий</p>
              <p className="mt-1 text-sm font-semibold leading-snug">
                {order.comment}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ArchiveMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-[#F7F7F7] px-3 py-2">
      <p className="text-xs font-semibold text-[#777777]">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function OrderZones({
  cardSize,
  groupedItems,
  compact,
  plain,
}: {
  cardSize: BaristaCardSize;
  groupedItems: { drinks: OrderItem[]; food: OrderItem[] };
  compact: boolean;
  plain: boolean;
}) {
  const size = getCardSizeClasses(cardSize);

  return (
    <div
      className={
        plain
          ? `${size.readyZonesMargin} ${size.readyZonesGap}`
          : `${size.zonesGap} divide-y divide-[#EFEFEF]`
      }
    >
      {groupedItems.drinks.length > 0 ? (
        <OrderItemsGroup
          icon="☕"
          label="Напитки"
          items={groupedItems.drinks}
          cardSize={cardSize}
          compact={compact}
          plain={plain}
        />
      ) : null}

      {groupedItems.food.length > 0 ? (
        <OrderItemsGroup
          icon="🥐"
          label="Еда"
          items={groupedItems.food}
          cardSize={cardSize}
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
  cardSize,
  icon,
  label,
  items,
  compact = false,
  plain = false,
}: {
  cardSize: BaristaCardSize;
  icon: string;
  label: string;
  items: OrderItem[];
  compact?: boolean;
  plain?: boolean;
}) {
  const size = getCardSizeClasses(cardSize);

  return (
    <section className={`${size.groupPadding} first:pt-0`}>
      <div className="flex items-center gap-2">
        <span className={compact ? "text-base leading-none" : "text-lg leading-none"}>
          {icon}
        </span>
        <p className="text-xs font-bold text-[#777777]">{label}</p>
      </div>
      <ul className={compact ? size.compactItemList : size.itemList}>
        {items.map((item, index) => (
          <li
            key={`${item.id}-${item.name}-${index}`}
            className={`${
              plain ? size.plainItem : size.itemRow
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

function getCardSizeClasses(cardSize: BaristaCardSize) {
  if (cardSize === "compact") {
    return {
      actionButton: "min-h-10 px-5 text-sm",
      actionMargin: "mt-3",
      cardPadding: "p-3",
      columnGap: "gap-2",
      commentPadding: "mt-2 py-2",
      compactItemList: "mt-1 space-y-1",
      customerMargin: "mt-1.5",
      customerText: "text-sm",
      footerMargin: "mt-3",
      footerPadding: "pt-2",
      groupPadding: "pt-2",
      itemList: "mt-1.5 space-y-1",
      itemRow: "px-0 py-1 text-sm",
      metaText: "text-xs",
      plainItem: "px-0 py-0 text-xs",
      readyNumber: "text-3xl",
      readyZonesGap: "space-y-1.5",
      readyZonesMargin: "mt-2",
      zonesGap: "space-y-2",
    };
  }

  if (cardSize === "large") {
    return {
      actionButton: "min-h-12 px-7 text-lg",
      actionMargin: "mt-5",
      cardPadding: "p-5",
      columnGap: "gap-4",
      commentPadding: "mt-4 py-4",
      compactItemList: "mt-2 space-y-2",
      customerMargin: "mt-3",
      customerText: "text-lg",
      footerMargin: "mt-5",
      footerPadding: "pt-4",
      groupPadding: "pt-4",
      itemList: "mt-3 space-y-3",
      itemRow: "px-0 py-2 text-lg",
      metaText: "text-base",
      plainItem: "px-0 py-1 text-sm",
      readyNumber: "text-5xl",
      readyZonesGap: "space-y-3",
      readyZonesMargin: "mt-4",
      zonesGap: "space-y-4",
    };
  }

  return {
    actionButton: "min-h-11 px-6 text-base",
    actionMargin: "mt-4",
    cardPadding: "p-4",
    columnGap: "gap-3",
    commentPadding: "mt-3 py-3",
    compactItemList: "mt-1.5 space-y-1.5",
    customerMargin: "mt-2",
    customerText: "text-base",
    footerMargin: "mt-4",
    footerPadding: "pt-3",
    groupPadding: "pt-3",
    itemList: "mt-2 space-y-2",
    itemRow: "px-0 py-1.5 text-base",
    metaText: "text-sm",
    plainItem: "px-0 py-0.5 text-xs",
    readyNumber: "text-4xl",
    readyZonesGap: "space-y-2",
    readyZonesMargin: "mt-3",
    zonesGap: "space-y-3",
  };
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

function filterArchiveOrders(orders: Order[], search: string) {
  const query = normalizeSearch(search);

  if (!query) return orders;

  return orders.filter((order) =>
    normalizeSearch([order.number, order.customerName, order.phone].join(" ")).includes(
      query,
    ),
  );
}

function filterOrdersByArchiveDate(orders: Order[], dateKey: string) {
  return orders.filter((order) => getOrderArchiveDateKey(order) === dateKey);
}

function getOrderArchiveDateKey(order: Order) {
  return getArchiveValueDateKey(order.completedAt ?? order.statusChangedAt ?? order.createdAt);
}

function getArchiveValueDateKey(value: string | number) {
  if (typeof value === "number") {
    return getLocalDateKey(new Date(value));
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime()) && value.includes("T")) {
    return getLocalDateKey(date);
  }

  return getLocalDateKey(new Date());
}

function formatArchiveDateLabel(dateKey: string) {
  const todayKey = getLocalDateKey(new Date());
  const yesterdayKey = getLocalDateKey(addDays(new Date(), -1));

  if (dateKey === todayKey) return "сегодня";
  if (dateKey === yesterdayKey) return "вчера";

  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) return dateKey;

  return `${day}.${month}.${year}`;
}

function formatArchiveTime(value: string | number | undefined) {
  if (!value) return "Нет данных";

  if (typeof value === "number") {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime()) && value.includes("T")) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return value;
}

function formatArchiveShortTime(value: string | number | undefined) {
  if (!value) return "Нет";

  if (typeof value === "number") {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime()) && value.includes("T")) {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return value;
}

function formatMoney(value?: number) {
  if (typeof value !== "number") return "Нет данных";

  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatOrderSource(source?: Order["source"]) {
  if (source === "client") return "Онлайн";
  if (source === "iiko") return "IIKO";
  if (source === "mock") return "Тест";

  return "Не указан";
}

function formatCompactPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length >= 10) {
    const normalized = digits.length === 11 && digits.startsWith("8")
      ? `7${digits.slice(1)}`
      : digits;
    const local = normalized.slice(-10);

    return `+7 ${local.slice(0, 3)}...${local.slice(-2)}`;
  }

  return phone;
}

function formatItemCount(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} позиций`;
  }

  if (lastDigit === 1) {
    return `${count} позиция`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} позиции`;
  }

  return `${count} позиций`;
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
