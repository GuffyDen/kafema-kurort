"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { CartItem } from "@/components/CartModal";
import { getMenuItemPrice, getMenuItemSummary } from "@/lib/menuStore";

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
    <div className="fixed inset-0 z-50 flex items-center bg-[#F7F7F7] px-4 py-8">
      <form
        className="mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[32px] bg-[#FFFFFF] shadow-[0_24px_56px_rgba(119,119,119,0.22)]"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between border-b border-[#EFEFEF] px-5 py-5">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A1A]">
              Оформление
            </h2>
            <p className="mt-1 text-sm text-[#777777]">
              Заполните данные для предзаказа
            </p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFFFFF] text-2xl leading-none text-[#1A1A1A] shadow-[0_8px_18px_rgba(119,119,119,0.14)] transition duration-300 hover:bg-[#F7F7F7] active:scale-95"
            onClick={onBack}
            aria-label="Вернуться в корзину"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-semibold text-[#1A1A1A]">Имя</span>
              <input
                className="mt-2 h-14 w-full rounded-[20px] border border-[#EFEFEF] bg-[#FFFFFF] px-4 text-base text-[#1A1A1A] outline-none transition focus:border-[#E30613]"
                name="name"
                placeholder="Как к вам обращаться"
                required
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#1A1A1A]">
                Телефон
              </span>
              <input
                className="mt-2 h-14 w-full rounded-[20px] border border-[#EFEFEF] bg-[#FFFFFF] px-4 text-base text-[#1A1A1A] outline-none transition focus:border-[#E30613]"
                name="phone"
                placeholder="+7 999 000-00-00"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
              />
              {phoneError ? (
                <p className="mt-2 text-sm font-medium text-[#E30613]">
                  {phoneError}
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#1A1A1A]">
                Комментарий к заказу
              </span>
              <textarea
                className="mt-2 min-h-24 w-full resize-none rounded-[20px] border border-[#EFEFEF] bg-[#FFFFFF] px-4 py-4 text-base text-[#1A1A1A] outline-none transition focus:border-[#E30613]"
                name="comment"
                placeholder="Например: без сахара"
              />
            </label>
          </div>

          <section className="rounded-[24px] border border-[#EFEFEF] bg-[#FFFFFF] p-4 shadow-[0_12px_28px_rgba(119,119,119,0.12)]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#1A1A1A]">
                Состав заказа
              </h3>
              <span className="text-sm text-[#777777]">
                {itemsCount} шт.
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="font-semibold text-[#1A1A1A]">
                      {item.product.name}
                    </p>
                    <p className="mt-1 text-sm text-[#777777]">
                      {item.quantity} × {getMenuItemSummary(item.product)}
                    </p>
                  </div>
                  <p className="shrink-0 font-bold text-[#1A1A1A]">
                    {(
                      getMenuItemPrice(item.product) * item.quantity
                    ).toLocaleString(
                      "ru-RU",
                    )}{" "}
                    ₽
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[#EFEFEF] pt-4">
              <span className="text-base font-semibold text-[#1A1A1A]">
                Итого
              </span>
              <span className="text-2xl font-bold text-[#1A1A1A]">
                {total.toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </section>
        </div>

        <div className="border-t border-[#EFEFEF] bg-[#FFFFFF] px-5 pb-5 pt-4">
          <button
            type="submit"
            className="h-[60px] w-full rounded-[24px] bg-[#E30613] px-5 text-base font-bold text-white shadow-[0_18px_34px_rgba(227,6,19,0.24)] transition duration-300 hover:bg-[#C90511] active:scale-[0.99]"
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
