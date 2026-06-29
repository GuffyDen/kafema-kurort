"use client";

import type { Product } from "@/components/ProductCard";

export type CartItem = {
  product: Product;
  quantity: number;
};

type CartModalProps = {
  items: CartItem[];
  total: number;
  onClose: () => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
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
  return (
    <div className="fixed inset-0 z-50 flex items-center bg-[#F7F7F7] px-4 py-8">
      <div className="mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[32px] bg-[#FFFFFF] shadow-[0_24px_56px_rgba(119,119,119,0.22)]">
        <div className="flex items-center justify-between border-b border-[#EFEFEF] px-5 py-5">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A1A]">Корзина</h2>
            <p className="mt-1 text-sm text-[#777777]">
              Проверьте заказ перед оформлением
            </p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFFFFF] text-2xl leading-none text-[#1A1A1A] shadow-[0_8px_18px_rgba(119,119,119,0.14)] transition duration-300 hover:bg-[#F7F7F7] active:scale-95"
            onClick={onClose}
            aria-label="Закрыть корзину"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {items.map((item) => (
            <article
              key={item.product.id}
              className="flex gap-4 rounded-[24px] border border-[#EFEFEF] bg-[#FFFFFF] p-3 shadow-[0_12px_28px_rgba(119,119,119,0.12)]"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[20px] bg-[#F7F7F7]">
                <img
                  src={item.product.imageSrc}
                  alt={item.product.name}
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-[#1A1A1A]">
                  {item.product.name}
                </h3>
                <p className="mt-1 text-sm text-[#777777]">
                  {item.product.volume}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-base font-bold text-[#1A1A1A]">
                    {(item.product.price * item.quantity).toLocaleString(
                      "ru-RU",
                    )}{" "}
                    ₽
                  </p>
                  <div className="flex items-center gap-2 rounded-full bg-[#F7F7F7] p-1">
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFFFFF] text-xl leading-none text-[#1A1A1A] shadow-sm transition duration-300 active:scale-95"
                      onClick={() => onDecrease(item.product.id)}
                      aria-label={`Уменьшить количество ${item.product.name}`}
                    >
                      −
                    </button>
                    <span className="min-w-5 text-center text-sm font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E30613] text-xl leading-none text-white shadow-sm transition duration-300 active:scale-95"
                      onClick={() => onIncrease(item.product.id)}
                      aria-label={`Увеличить количество ${item.product.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="border-t border-[#EFEFEF] bg-[#FFFFFF] px-5 pb-5 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-[#1A1A1A]">Итого</span>
            <span className="text-2xl font-bold text-[#1A1A1A]">
              {total.toLocaleString("ru-RU")} ₽
            </span>
          </div>
          <button
            type="button"
            className="mt-4 h-[60px] w-full rounded-[24px] bg-[#E30613] px-5 text-base font-bold text-white shadow-[0_18px_34px_rgba(227,6,19,0.24)] transition duration-300 hover:bg-[#C90511] active:scale-[0.99]"
            onClick={onCheckout}
          >
            Оформить заказ
          </button>
        </div>
      </div>
    </div>
  );
}
