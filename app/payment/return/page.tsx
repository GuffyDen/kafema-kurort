"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getStoredActiveOrderReference, requestOrderPayment } from "@/lib/orderStore";
import type { CustomerOrderReference, PaymentStatus } from "@/lib/orderTypes";

export default function PaymentReturnPage() {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);
  const [generation, setGeneration] = useState(0);
  const reference = useRef<CustomerOrderReference | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    const stored = getStoredActiveOrderReference();
    const expectedId = new URLSearchParams(window.location.search).get("orderId");
    if (stored && stored.id === expectedId) reference.current = stored;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      if (!reference.current) {
        setError("Доступ к заказу не найден. Откройте его в том браузере, где оформляли заказ.");
        setLoading(false);
        return;
      }
      if (document.hidden) { timer = setTimeout(poll, 5000); return; }
      let terminal = false;
      try {
        const result = await requestOrderPayment(reference.current);
        if (stopped) return;
        setStatus(result.paymentStatus!);
        setError("");
        terminal = result.paymentStatus === "succeeded" || result.paymentStatus === "canceled";
      } catch {
        if (!stopped) setError("Не удалось проверить оплату. Результат пока неизвестен — попробуйте обновить статус.");
      } finally {
        if (!stopped) {
          setLoading(false);
          attempts += 1;
          if (!terminal && attempts < 24) timer = setTimeout(poll, 5000);
          else setPollingStopped(!terminal);
        }
      }
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [generation]);

  async function continuePayment() {
    if (!reference.current || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result = await requestOrderPayment(reference.current, true);
      setStatus(result.paymentStatus!);
      if (result.confirmationUrl) window.location.assign(result.confirmationUrl);
      else setGeneration((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось открыть оплату.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg-cream)] px-4 py-8 text-[var(--color-text-main)]">
      <section className="w-full max-w-md rounded-[var(--radius-xxl)] bg-[var(--color-card)] p-6 shadow-[var(--shadow-soft)]">
        <div aria-live="polite">
          <h1 className="text-2xl font-black">{loading ? "Проверяем оплату…" : status === "succeeded" ? "Заказ оплачен" : status === "canceled" ? "Оплата не завершена" : "Ожидаем подтверждение оплаты"}</h1>
          <p className="mt-3 leading-6">{status === "succeeded" ? "Оплата подтверждена. Статус приготовления доступен в заказах." : status === "canceled" ? "Платёж отменён. Заказ не передан бариста." : "Если вы уже оплатили заказ, дождитесь подтверждения. Возврат на эту страницу сам по себе не подтверждает оплату."}</p>
          {error ? <p role="alert" className="mt-3 text-sm font-semibold text-[#9B2D1F]">{error}</p> : null}
          {pollingStopped ? <p className="mt-3 text-sm">Автопроверка приостановлена. Можно обновить статус вручную.</p> : null}
        </div>
        {status === "pending" ? <button type="button" disabled={submitting || loading} onClick={continuePayment} className="mt-5 min-h-12 w-full rounded-3xl bg-[var(--color-caramel)] px-4 font-bold text-white disabled:opacity-50">{submitting ? "Открываем оплату…" : "Продолжить оплату"}</button> : null}
        {(error || pollingStopped) ? <button type="button" disabled={submitting} onClick={() => { setPollingStopped(false); setGeneration((value) => value + 1); }} className="mt-3 min-h-12 w-full rounded-3xl border border-[#E8D9C8] px-4 font-bold">Обновить статус</button> : null}
        <Link href="/" className="mt-3 flex min-h-12 items-center justify-center font-bold">Вернуться в меню</Link>
      </section>
    </main>
  );
}
