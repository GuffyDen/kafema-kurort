"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import type { CartItem } from "@/components/CartModal";

type CheckoutModalProps = {
  items: CartItem[];
  total: number;
  itemsCount: number;
  onBack: () => void;
  onConfirm: (customer: {
    name: string;
    phone: string;
    comment?: string;
  }) => void;
};

export function CheckoutModal({
  items,
  total,
  itemsCount,
  onBack,
  onConfirm,
}: CheckoutModalProps) {
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    const savedPhone = localStorage.getItem("kafema-phone");

    if (savedPhone) {
      const syncPhone = window.setTimeout(() => {
        setPhone(formatPhone(savedPhone));
      }, 0);

      return () => window.clearTimeout(syncPhone);
    }
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const comment = String(formData.get("comment") ?? "").trim();

    if (getNationalPhoneDigits(phone).length !== 10) {
      setPhoneError("Введите корректный номер телефона");
      return;
    }

    localStorage.setItem("kafema-phone", phone);
    setPhoneError("");
    onConfirm({ name, phone, comment: comment || undefined });
  }

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    setPhone(formatPhone(event.target.value));
    setPhoneError("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center overflow-hidden bg-[#F5EEE3]/95 px-4 py-8 backdrop-blur">
      <BackgroundDecor />
      <form
        className="relative z-10 mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-xxl)] bg-[var(--color-card)] shadow-[var(--shadow-soft)]"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between border-b border-[#E8D9C8] px-5 py-5">
          <div>
            <h2 className="text-2xl font-black text-[var(--color-text-main)]">
              Оформление
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Заполните данные для предзаказа
            </p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF7EA] text-2xl leading-none text-[var(--color-text-main)] shadow-[0_8px_18px_rgba(73,52,36,0.10)] transition duration-300 hover:text-[var(--color-caramel)] active:scale-95"
            onClick={onBack}
            aria-label="Вернуться в корзину"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-bold text-[var(--color-text-main)]">Имя</span>
              <input
                className="mt-2 h-14 w-full rounded-[22px] border border-[#E8D9C8] bg-[#FFFDF8] px-4 text-base text-[var(--color-text-main)] outline-none transition focus:border-[var(--color-caramel)]"
                name="name"
                placeholder="Как к вам обращаться"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-[var(--color-text-main)]">
                Телефон
              </span>
              <input
                className="mt-2 h-14 w-full rounded-[22px] border border-[#E8D9C8] bg-[#FFFDF8] px-4 text-base text-[var(--color-text-main)] outline-none transition focus:border-[var(--color-caramel)]"
                name="phone"
                placeholder="+7 999 000-00-00"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
              />
              {phoneError ? (
                <p className="mt-2 text-sm font-semibold text-[#9B2D1F]">
                  {phoneError}
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-bold text-[var(--color-text-main)]">
                Комментарий к заказу
              </span>
              <textarea
                className="mt-2 min-h-24 w-full resize-none rounded-[22px] border border-[#E8D9C8] bg-[#FFFDF8] px-4 py-4 text-base text-[var(--color-text-main)] outline-none transition focus:border-[var(--color-caramel)]"
                name="comment"
                placeholder="Например: без сахара"
              />
            </label>
          </div>

          <section className="rounded-[28px] border border-[#E8D9C8] bg-[#FFFDF8] p-4 shadow-[0_12px_28px_rgba(73,52,36,0.08)]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[var(--color-text-main)]">
                Состав заказа
              </h3>
              <span className="text-sm text-[var(--color-text-muted)]">
                {itemsCount} шт.
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="font-bold text-[var(--color-text-main)]">
                      {item.product.name}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {item.quantity} × {item.summary}
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
                  </div>
                  <p className="shrink-0 font-black text-[var(--color-text-main)]">
                    {(
                      item.unitPrice * item.quantity
                    ).toLocaleString(
                      "ru-RU",
                    )}{" "}
                    ₽
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[#E8D9C8] pt-4">
              <span className="text-base font-semibold text-[var(--color-text-main)]">
                Итого
              </span>
              <span className="text-2xl font-black text-[var(--color-text-main)]">
                {total.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </section>
        </div>

        <div className="border-t border-[#E8D9C8] bg-[var(--color-card)] px-5 pb-5 pt-4">
          <button
            type="submit"
            className="h-[60px] w-full rounded-[28px] bg-[var(--color-caramel)] px-5 text-base font-black text-white shadow-[0_18px_34px_rgba(189,134,73,0.26)] transition duration-300 hover:bg-[#A86F34] active:scale-[0.99]"
          >
            Подтвердить заказ
          </button>
        </div>
      </form>
    </div>
  );
}

function getNationalPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("8") || digits.startsWith("7")) {
    return digits.slice(1, 11);
  }

  return digits.slice(0, 10);
}

function formatPhone(value: string) {
  const nationalDigits = getNationalPhoneDigits(value);

  if (!nationalDigits) {
    return "";
  }

  const area = nationalDigits.slice(0, 3);
  const first = nationalDigits.slice(3, 6);
  const second = nationalDigits.slice(6, 8);
  const third = nationalDigits.slice(8, 10);

  let formatted = "+7";

  if (area) {
    formatted += ` (${area}`;
  }

  if (area.length === 3) {
    formatted += ")";
  }

  if (first) {
    formatted += ` ${first}`;
  }

  if (second) {
    formatted += `-${second}`;
  }

  if (third) {
    formatted += `-${third}`;
  }

  return formatted;
}
