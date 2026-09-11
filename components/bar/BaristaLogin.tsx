"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function BaristaLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/barista/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setPassword("");
        setError(payload.error || "Не удалось выполнить вход.");
        return;
      }
      router.refresh();
    } catch {
      setError("Сервис входа временно недоступен.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F7F7] px-4 py-8 text-[#1A1A1A] sm:px-5">
      <form
        className="w-full max-w-md rounded-[30px] bg-white p-6 shadow-[0_18px_42px_rgba(26,26,26,0.08)]"
        onSubmit={submit}
      >
        <div className="flex items-center gap-3">
          <Image
            alt="Tablo"
            className="h-10 w-10 object-contain"
            height={40}
            priority
            src="/tablo-logo.png"
            width={40}
          />
          <div>
            <h1 className="text-2xl font-bold">Вход для бариста</h1>
            <p className="text-sm font-semibold text-[#777777]">Рабочее место Tablo</p>
          </div>
        </div>

        <label className="mt-6 block" htmlFor="barista-username">
          <span className="text-sm font-bold">Логин</span>
          <input
            autoCapitalize="none"
            autoComplete="username"
            className="mt-2 h-12 w-full rounded-[18px] border border-[#E8E8E8] px-4 outline-none transition focus:border-[#E30613]"
            id="barista-username"
            name="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="mt-4 block" htmlFor="barista-password">
          <span className="text-sm font-bold">Пароль</span>
          <input
            autoComplete="current-password"
            className="mt-2 h-12 w-full rounded-[18px] border border-[#E8E8E8] px-4 outline-none transition focus:border-[#E30613]"
            id="barista-password"
            name="password"
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? (
          <p className="mt-3 text-sm font-bold text-[#8F2F24]" role="alert">
            {error}
          </p>
        ) : null}

        <button
          className="mt-5 h-12 w-full rounded-[18px] bg-[#E30613] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting || !username.trim() || !password}
          type="submit"
        >
          {isSubmitting ? "Проверяем..." : "Войти"}
        </button>
      </form>
    </main>
  );
}
