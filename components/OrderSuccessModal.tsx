"use client";

import type { Order, OrderStatus } from "@/lib/orderStore";

type OrderSuccessModalProps = {
  order: Order;
  onBackToMenu: () => void;
};

const statusText: Record<OrderStatus, string> = {
  new: "Заказ принят",
  in_progress: "Готовится",
  ready: "Заказ готов",
  completed: "Выдан",
};

export function OrderSuccessModal({
  order,
  onBackToMenu,
}: OrderSuccessModalProps) {
  const isReady = order.status === "ready";

  return (
    <div className="fixed inset-0 z-50 flex items-center bg-[#F7F7F7] px-4 py-8">
      <div className="mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[32px] bg-[#FFFFFF] shadow-[0_24px_56px_rgba(119,119,119,0.22)]">
        <div className="px-6 py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E30613] text-3xl text-white">
            ✓
          </div>

          <h2 className="mt-6 text-3xl font-bold text-[#1A1A1A]">
            {statusText[order.status]}
          </h2>

          {isReady ? (
            <div className="mt-5 rounded-[28px] bg-[#E30613] px-5 py-5 text-white">
              <p className="text-2xl font-bold">Ваш заказ готов</p>
              <p className="mt-2 text-base font-semibold">
                Подойдите к стойке выдачи
              </p>
            </div>
          ) : null}

          <p className="mt-6 text-sm font-semibold text-[#777777]">
            Ваш номер:
          </p>
          <p className="mt-2 text-4xl font-bold text-[#E30613]">
            №{order.number}
          </p>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-6">
          <section className="rounded-[24px] bg-[#F7F7F7] p-4">
            <p className="text-sm font-semibold text-[#777777]">Клиент</p>
            <p className="mt-1 text-xl font-bold text-[#1A1A1A]">
              {order.customerName}
            </p>
          </section>

          <section className="rounded-[24px] border border-[#EFEFEF] bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1A1A1A]">
                Состав заказа
              </h3>
              <span className="rounded-full bg-[#F7F7F7] px-3 py-1 text-sm font-semibold text-[#777777]">
                {order.createdAt}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {order.items.map((item, index) => (
                <div
                  key={`${order.id}-${item.id}-${index}`}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-[#1A1A1A]">
                      {item.name}
                    </p>
                    <p className="mt-1 text-sm text-[#777777]">
                      {item.volume}
                    </p>
                    {item.modifiers?.length ? (
                      <ul className="mt-2 space-y-1">
                        {item.modifiers.map((modifier, modifierIndex) => (
                          <li
                            className="text-xs font-medium text-[#777777]"
                            key={`${modifier}-${modifierIndex}`}
                          >
                            • {modifier}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <p className="shrink-0 rounded-full bg-[#F7F7F7] px-3 py-1 font-bold text-[#1A1A1A]">
                    x{item.quantity}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {order.comment ? (
            <section className="rounded-[24px] border border-[#EFEFEF] bg-white p-4">
              <p className="text-sm font-semibold text-[#777777]">
                Комментарий
              </p>
              <p className="mt-2 text-base font-semibold text-[#1A1A1A]">
                {order.comment}
              </p>
            </section>
          ) : null}
        </div>

        <div className="border-t border-[#EFEFEF] bg-[#FFFFFF] px-5 pb-5 pt-4">
          <button
            type="button"
            className="h-[60px] w-full rounded-[24px] bg-[#E30613] px-5 text-base font-bold text-white shadow-[0_18px_34px_rgba(227,6,19,0.24)] transition duration-300 hover:bg-[#C90511] active:scale-[0.99]"
            onClick={onBackToMenu}
          >
            Вернуться в меню
          </button>
        </div>
      </div>
    </div>
  );
}
