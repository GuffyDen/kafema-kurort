"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import type { CartItem } from "@/components/CartModal";
import { normalizeOrderEmail } from "@/lib/orderEmail";

type CheckoutModalProps = {
  items: CartItem[];
  total: number;
  itemsCount: number;
  availabilityMessage: string;
  isCheckingAvailability: boolean;
  onBack: () => void;
  onConfirm: (customer: {
    name: string;
    phone: string;
    email: string;
    comment?: string;
    personalDataConsent: boolean;
    idempotencyKey: string;
  }) => Promise<void>;
};

export function CheckoutModal({
  items,
  total,
  itemsCount,
  availabilityMessage,
  isCheckingAvailability,
  onBack,
  onConfirm,
}: CheckoutModalProps) {
  const [customerName, setCustomerName] = useState(() => getStoredCustomerProfile().name);
  const [phone, setPhone] = useState(() => {
    const profile = getStoredCustomerProfile();
    const legacyPhone =
      typeof window === "undefined" ? "" : localStorage.getItem("kafema-phone") || "";
    return formatPhone(profile.phone || legacyPhone);
  });
  const [phoneError, setPhoneError] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [personalDataConsent, setPersonalDataConsent] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;

    const formData = new FormData(event.currentTarget);
    const name = customerName.trim();
    const comment = String(formData.get("comment") ?? "").trim();

    if (!personalDataConsent) {
      setConsentError(
        "Для оформления заказа необходимо дать согласие на обработку персональных данных.",
      );
      return;
    }

    if (getNationalPhoneDigits(phone).length !== 10) {
      setPhoneError("Введите корректный номер телефона");
      return;
    }

    const normalizedEmail = normalizeOrderEmail(email);
    if (!normalizedEmail) {
      setEmailError("Введите корректный email для чека");
      return;
    }

    setPhoneError("");
    setEmailError("");
    setConsentError("");
    setSubmissionError("");
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    idempotencyKeyRef.current ??= crypto.randomUUID();

    try {
      await onConfirm({
        name,
        phone,
        email: normalizedEmail,
        comment: comment || undefined,
        personalDataConsent,
        idempotencyKey: idempotencyKeyRef.current,
      });
      saveCustomerProfile({ name, phone });
      localStorage.setItem("kafema-phone", phone);
    } catch (error) {
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Не удалось создать заказ. Попробуйте ещё раз.",
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
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
            disabled={isSubmitting}
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
                maxLength={80}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
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
                required
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
                Email для электронного чека
              </span>
              <input
                className="mt-2 h-14 w-full rounded-[22px] border border-[#E8D9C8] bg-[#FFFDF8] px-4 text-base text-[var(--color-text-main)] outline-none transition focus:border-[var(--color-caramel)]"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@example.ru"
                maxLength={254}
                required
                value={email}
                aria-invalid={Boolean(emailError)}
                aria-describedby="checkout-email-hint"
                onChange={(event) => { setEmail(event.target.value); setEmailError(""); }}
              />
              <p id="checkout-email-hint" className={`mt-2 text-sm ${emailError ? "font-semibold text-[#9B2D1F]" : "text-[var(--color-text-muted)]"}`}>
                {emailError || "Отправим чеки об оплате и выдаче заказа."}
              </p>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-[var(--color-text-main)]">
                Комментарий к заказу
              </span>
              <textarea
                className="mt-2 min-h-24 w-full resize-none rounded-[22px] border border-[#E8D9C8] bg-[#FFFDF8] px-4 py-4 text-base text-[var(--color-text-main)] outline-none transition focus:border-[var(--color-caramel)]"
                name="comment"
                placeholder="Например: без сахара"
                maxLength={500}
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
          {availabilityMessage ? (
            <p className="mb-4 rounded-[20px] bg-[#FCE8E5] px-4 py-3 text-sm font-bold leading-5 text-[#8F2F24]">
              {availabilityMessage}
            </p>
          ) : null}
          {submissionError ? (
            <p
              role="alert"
              className="mb-4 rounded-[20px] bg-[#FCE8E5] px-4 py-3 text-sm font-bold leading-5 text-[#8F2F24]"
            >
              {submissionError}
            </p>
          ) : null}
          <div className="mb-4 rounded-[22px] border border-[#E8D9C8] bg-[#FFFDF8] px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <label
                htmlFor="personal-data-consent"
                className="-ml-2 -mt-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
              >
                <input
                  id="personal-data-consent"
                  name="personalDataConsent"
                  type="checkbox"
                  checked={personalDataConsent}
                  aria-label="Согласие на обработку персональных данных"
                  aria-describedby={consentError ? "personal-data-consent-error" : undefined}
                  aria-invalid={Boolean(consentError)}
                  className="h-5 w-5 cursor-pointer accent-[#BD8649]"
                  onChange={(event) => {
                    setPersonalDataConsent(event.target.checked);
                    setConsentError("");
                  }}
                />
              </label>
              <p className="text-sm leading-5 text-[var(--color-text-main)]">
                Я даю{" "}
                <Link
                  href="/legal/personal-data-consent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#8B572F] underline decoration-[#CFB79F] underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649]"
                >
                  согласие на обработку персональных данных
                </Link>{" "}
                и ознакомлен(а) с{" "}
                <Link
                  href="/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#8B572F] underline decoration-[#CFB79F] underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649]"
                >
                  Политикой конфиденциальности
                </Link>
                .
              </p>
            </div>
            {consentError ? (
              <p
                id="personal-data-consent-error"
                role="alert"
                className="mt-2 text-sm font-semibold leading-5 text-[#9B2D1F]"
              >
                {consentError}
              </p>
            ) : null}
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
              Нажимая кнопку перехода к оплате, я принимаю условия{" "}
              <Link
                href="/legal/offer"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#8B572F] underline decoration-[#CFB79F] underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649]"
              >
                Публичной оферты
              </Link>
              .
            </p>
          </div>
          <button
            type="submit"
            className="h-[60px] w-full rounded-[28px] bg-[var(--color-caramel)] px-5 text-base font-black text-white shadow-[0_18px_34px_rgba(189,134,73,0.26)] transition duration-300 hover:bg-[#A86F34] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#D9C8B5] disabled:shadow-none"
            disabled={isCheckingAvailability || isSubmitting || !personalDataConsent}
          >
            {isSubmitting
              ? "Создаём заказ..."
              : isCheckingAvailability
                ? "Проверяем наличие..."
                : "Подтвердить заказ"}
          </button>
        </div>
      </form>
    </div>
  );
}

const customerProfileKey = "kafema_customer_profile";

type CustomerProfile = {
  name: string;
  phone: string;
};

function getStoredCustomerProfile(): CustomerProfile {
  if (typeof window === "undefined") {
    return { name: "", phone: "" };
  }

  const savedProfile = localStorage.getItem(customerProfileKey);

  if (!savedProfile) {
    return { name: "", phone: "" };
  }

  try {
    const parsedProfile = JSON.parse(savedProfile) as Partial<CustomerProfile>;

    return {
      name: typeof parsedProfile.name === "string" ? parsedProfile.name : "",
      phone: typeof parsedProfile.phone === "string" ? parsedProfile.phone : "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}

function saveCustomerProfile(profile: CustomerProfile) {
  localStorage.setItem(customerProfileKey, JSON.stringify(profile));
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
