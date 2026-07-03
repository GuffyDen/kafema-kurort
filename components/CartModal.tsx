"use client";

import { BackgroundDecor } from "@/components/BackgroundDecor";
import type { Product } from "@/components/ProductCard";
import type { MenuSelection } from "@/lib/menuStore";

export type CartItem = {
  id: string;
  product: Product;
  selection: MenuSelection;
  summary: string;
  modifiers: string[];
  unitPrice: number;
  quantity: number;
};

type CartModalProps = {
  items: CartItem[];
  total: number;
  onClose: () => void;
  onIncrease: (cartItemId: string) => void;
  onDecrease: (cartItemId: string) => void;
  onCheckout: () => void;
};

export function CartModal({
  items,
  total,
  onClose,
  onIncrease,
  onDecrease,
  onCheckout,
}: CartModalProps) {
  const isEmpty = items.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center overflow-hidden bg-[#F5EEE3]/95 px-4 py-8 backdrop-blur">
      <BackgroundDecor />
      <div className="relative z-10 mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-xxl)] bg-[var(--color-card)] shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between border-b border-[#E8D9C8] px-5 py-5">
          <div>
            <h2 className="text-2xl font-black text-[var(--color-text-main)]">Корзина</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Проверьте заказ перед оформлением
            </p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF7EA] text-2xl leading-none text-[var(--color-text-main)] shadow-[0_8px_18px_rgba(73,52,36,0.10)] transition duration-300 hover:text-[var(--color-caramel)] active:scale-95"
            onClick={onClose}
            aria-label="Закрыть корзину"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {isEmpty ? (
            <div className="rounded-[28px] border border-dashed border-[#E8D9C8] bg-[#FFFDF8] px-5 py-10 text-center">
              <p className="text-xl font-black text-[var(--color-text-main)]">
                Корзина пуста
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-text-muted)]">
                Добавьте позиции из меню, чтобы оформить заказ.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <article
                key={item.id}
                className="flex gap-4 rounded-[28px] border border-[#E8D9C8] bg-[#FFFDF8] p-3 shadow-[0_12px_28px_rgba(73,52,36,0.08)]"
              >
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[22px] bg-[#EFE2D1]">
                  <img
                    src={item.product.imageSrc}
                    alt={item.product.name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold text-[var(--color-text-main)]">
                    {item.product.name}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {item.summary}
                  </p>
                  {item.modifiers.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {item.modifiers.map((modifier, modifierIndex) => (
                        <li className="text-xs font-semibold text-[var(--color-text-muted)]" key={`${modifier}-${modifierIndex}`}>
                          • {modifier}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-base font-black text-[var(--color-text-main)]">
                      {(
                        item.unitPrice * item.quantity
                      ).toLocaleString(
                        "ru-RU",
                      )}{" "}
                      ₽
                    </p>
                    <div className="flex items-center gap-2 rounded-full bg-[#F2E7D9] p-1">
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-card)] text-xl leading-none text-[var(--color-text-main)] shadow-sm transition duration-300 active:scale-95"
                        onClick={() => onDecrease(item.id)}
                        aria-label={`Уменьшить количество ${item.product.name}`}
                      >
                        −
                      </button>
                      <span className="min-w-5 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8E2C3] text-xl leading-none text-[#9A642B] shadow-sm transition duration-300 active:scale-95"
                        onClick={() => onIncrease(item.id)}
                        aria-label={`Увеличить количество ${item.product.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="border-t border-[#E8D9C8] bg-[var(--color-card)] px-5 pb-5 pt-4">
          {isEmpty ? (
            <button
              type="button"
              className="h-[60px] w-full rounded-[28px] bg-[var(--color-card)] px-5 text-base font-black text-[var(--color-text-main)] shadow-[var(--shadow-soft)] transition duration-300 hover:text-[var(--color-caramel)] active:scale-[0.99]"
              onClick={onClose}
            >
              Вернуться в меню
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-[var(--color-text-main)]">Итого</span>
                <span className="text-2xl font-black text-[var(--color-text-main)]">
                  {total.toLocaleString("ru-RU")} ₽
                </span>
              </div>
              <button
                type="button"
                className="mt-4 h-[60px] w-full rounded-[28px] bg-[var(--color-caramel)] px-5 text-base font-black text-white shadow-[0_18px_34px_rgba(189,134,73,0.26)] transition duration-300 hover:bg-[#A86F34] active:scale-[0.99]"
                onClick={onCheckout}
              >
                Оформить заказ
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
