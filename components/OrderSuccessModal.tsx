"use client";

import { BackgroundDecor } from "@/components/BackgroundDecor";
import { LiveCupAnimation } from "@/components/LiveCupAnimation";
import {
  OrderStatusTimeline,
  type ClientJourneyStatus,
} from "@/components/OrderStatusTimeline";
import type { Order, OrderStatus } from "@/lib/orderStore";

type OrderSuccessModalProps = {
  order: Order;
  onBackToMenu: () => void;
  journeyStatusOverride?: ClientJourneyStatus;
};

const journeyStatusByOrderStatus: Record<OrderStatus, ClientJourneyStatus> = {
  new: "PAID",
  in_progress: "IN_PROGRESS",
  ready: "READY",
  completed: "READY",
};

const heroCopy: Record<
  ClientJourneyStatus,
  { eyebrow: string; title: string; subtitle: string }
> = {
  PAID: {
    eyebrow: "Заказ принят",
    title: "Ваш заказ принят",
    subtitle: "Передаем его бариста",
  },
  QUEUED: {
    eyebrow: "Заказ принят",
    title: "Ваш заказ принят",
    subtitle: "Скоро начнем готовить",
  },
  IN_PROGRESS: {
    eyebrow: "Заказ в работе",
    title: "Ваш заказ готовится",
    subtitle: "Напитки и еда собираются по составу заказа",
  },
  READY: {
    eyebrow: "Готово",
    title: "Ваш заказ готов",
    subtitle: "Подойдите к стойке выдачи",
  },
};

export function OrderSuccessModal({
  journeyStatusOverride,
  order,
  onBackToMenu,
}: OrderSuccessModalProps) {
  const journeyStatus = journeyStatusOverride ?? journeyStatusByOrderStatus[order.status];
  const copy = heroCopy[journeyStatus];
  const isReady = journeyStatus === "READY";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--color-bg-cream)] px-4 py-5 text-[var(--color-text-main)]">
      <BackgroundDecor />
      <main className="relative z-10 mx-auto flex min-h-full w-full max-w-md flex-col">
        <header className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 leading-none text-[var(--color-coffee)]">
            <p className="text-[clamp(1.65rem,7vw,2.35rem)] font-light tracking-[0.28em]">
              КАФЕМА
            </p>
            <p className="mt-2 text-center text-sm font-semibold tracking-[0.48em] text-[var(--color-caramel)]">
              КУРОРТ
            </p>
          </div>
          <div className="rounded-[28px] bg-[var(--color-card)] px-4 py-3 text-right shadow-[var(--shadow-soft)]">
            <p className="text-xs font-semibold text-[var(--color-text-muted)]">Заказ</p>
            <p className="text-3xl font-black text-[var(--color-caramel)]">#{order.number}</p>
          </div>
        </header>

        <section className="mt-5 overflow-hidden rounded-[40px] bg-[var(--color-card)] p-5 shadow-[var(--shadow-soft)]">
          <p className="mb-4 text-center text-sm font-bold uppercase tracking-[0.26em] text-[var(--color-caramel)]">
            Живой путь заказа
          </p>
          <OrderStatusTimeline status={journeyStatus} />
          <div className="mt-5 rounded-[34px] bg-[#F1E4D3] p-4">
            <LiveCupAnimation status={journeyStatus} />
          </div>

          <div className="px-1 pt-6 text-center">
            <p
              className={`text-sm font-bold ${
                isReady ? "text-[var(--color-caramel)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              {copy.eyebrow}
            </p>
            <h2 className="mt-2 text-[34px] font-black leading-none">
              {copy.title}
            </h2>
            <p className="mx-auto mt-3 max-w-[300px] text-base font-semibold leading-6 text-[var(--color-text-muted)]">
              {copy.subtitle}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-[32px] border border-[#E8D9C8] bg-[var(--color-card)] p-5 shadow-[var(--shadow-soft)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-muted)]">Клиент</p>
              <p className="mt-1 text-xl font-black">{order.customerName}</p>
            </div>
            <span className="rounded-full bg-[#F2E7D9] px-3 py-1.5 text-sm font-bold text-[var(--color-text-muted)]">
              {order.createdAt}
            </span>
          </div>

          <div className="mt-5 border-t border-[#E8D9C8] pt-4">
            <h3 className="text-base font-black">Состав заказа</h3>
            <div className="mt-4 space-y-4">
              {order.items.map((item, index) => (
                <div
                  className="flex items-start justify-between gap-4"
                  key={`${order.id}-${item.id}-${index}`}
                >
                  <div className="min-w-0">
                    <p className="font-bold">{item.name}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text-muted)]">
                      {item.volume}
                    </p>
                    {item.modifiers?.length ? (
                      <ul className="mt-2 space-y-1">
                        {item.modifiers.map((modifier, modifierIndex) => (
                          <li
                            className="text-xs font-semibold text-[var(--color-text-muted)]"
                            key={`${modifier}-${modifierIndex}`}
                          >
                            • {modifier}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <p className="shrink-0 rounded-full bg-[#F2E7D9] px-3 py-1 text-sm font-black">
                    ×{item.quantity}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {order.comment ? (
            <div className="mt-5 rounded-[24px] border border-[#E8D9C8] bg-[#FFF7EA] p-4">
              <p className="text-sm font-bold text-[var(--color-text-muted)]">Комментарий</p>
              <p className="mt-2 text-base font-semibold">{order.comment}</p>
            </div>
          ) : null}
        </section>

        <div className="sticky bottom-0 mt-auto bg-[#F5EEE3]/95 pb-4 pt-5 backdrop-blur">
          {isReady ? (
            <div className="mb-3 rounded-[28px] bg-[var(--color-caramel)] px-5 py-4 text-center text-white shadow-[0_18px_34px_rgba(189,134,73,0.26)]">
              <p className="text-2xl font-black">Ваш заказ готов</p>
              <p className="mt-1 text-sm font-bold">
                Подойдите к стойке выдачи
              </p>
            </div>
          ) : null}
          <button
            type="button"
            className="h-[60px] w-full rounded-[28px] bg-[var(--color-card)] px-5 text-base font-black text-[var(--color-text-main)] shadow-[var(--shadow-soft)] transition duration-300 hover:text-[var(--color-caramel)] active:scale-[0.99]"
            onClick={onBackToMenu}
          >
            Вернуться в меню
          </button>
        </div>
      </main>
    </div>
  );
}
