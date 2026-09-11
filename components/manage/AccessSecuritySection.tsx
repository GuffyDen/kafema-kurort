"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AUTH_PASSWORD_MIN_LENGTH,
  isValidAuthPassword,
  normalizeAuthUsername,
} from "@/lib/authValidation";

type AuthRole = "admin" | "barista";
type SafeAuthAccount = {
  role: AuthRole;
  username: string;
  updatedAt: string;
};
type AuthAccounts = Record<AuthRole, SafeAuthAccount>;
type Feedback = { kind: "error" | "success"; message: string } | null;

export function AccessSecuritySection() {
  const [accounts, setAccounts] = useState<AuthAccounts | null>(null);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminCurrentPassword, setAdminCurrentPassword] = useState("");
  const [adminNewPassword, setAdminNewPassword] = useState("");
  const [adminRepeatPassword, setAdminRepeatPassword] = useState("");
  const [baristaUsername, setBaristaUsername] = useState("");
  const [baristaNewPassword, setBaristaNewPassword] = useState("");
  const [baristaRepeatPassword, setBaristaRepeatPassword] = useState("");
  const [loadingError, setLoadingError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<AuthRole | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<Feedback>(null);
  const [baristaFeedback, setBaristaFeedback] = useState<Feedback>(null);

  useEffect(() => {
    const controller = new AbortController();
    void loadAccounts(controller.signal);
    return () => controller.abort();
  }, []);

  async function loadAccounts(signal?: AbortSignal) {
    setIsLoading(true);
    setLoadingError("");
    try {
      const response = await fetch("/api/admin/auth/accounts", {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        accounts?: AuthAccounts;
        error?: string;
      };
      if (!response.ok || !payload.accounts) {
        throw new Error(payload.error || "Не удалось загрузить данные доступа.");
      }
      setAccounts(payload.accounts);
      setAdminUsername(payload.accounts.admin.username);
      setBaristaUsername(payload.accounts.barista.username);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadingError(
        error instanceof Error
          ? error.message
          : "Сервис данных доступа временно недоступен.",
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }

  async function submitAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accounts || savingRole) return;
    setAdminFeedback(null);

    const error = validateCredentials({
      currentUsername: accounts.admin.username,
      username: adminUsername,
      currentPassword: adminCurrentPassword,
      newPassword: adminNewPassword,
      repeatPassword: adminRepeatPassword,
      requireCurrentPassword: true,
    });
    if (error) {
      setAdminFeedback({ kind: "error", message: error });
      return;
    }

    setSavingRole("admin");
    try {
      const account = await updateAccount({
        role: "admin",
        username: adminUsername,
        currentPassword: adminCurrentPassword,
        newPassword: adminNewPassword,
        repeatPassword: adminRepeatPassword,
      });
      setAccounts({ ...accounts, admin: account });
      setAdminCurrentPassword("");
      setAdminNewPassword("");
      setAdminRepeatPassword("");
      setAdminFeedback({
        kind: "success",
        message: "Данные доступа администратора обновлены. Войдите снова.",
      });
      window.setTimeout(() => window.location.assign("/admin"), 1_200);
    } catch (error) {
      setAdminCurrentPassword("");
      setAdminFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Не удалось сохранить изменения.",
      });
    } finally {
      setSavingRole(null);
    }
  }

  async function submitBarista(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accounts || savingRole) return;
    setBaristaFeedback(null);

    const error = validateCredentials({
      currentUsername: accounts.barista.username,
      username: baristaUsername,
      newPassword: baristaNewPassword,
      repeatPassword: baristaRepeatPassword,
      requireCurrentPassword: false,
    });
    if (error) {
      setBaristaFeedback({ kind: "error", message: error });
      return;
    }

    setSavingRole("barista");
    try {
      const account = await updateAccount({
        role: "barista",
        username: baristaUsername,
        newPassword: baristaNewPassword,
        repeatPassword: baristaRepeatPassword,
      });
      setAccounts({ ...accounts, barista: account });
      setBaristaUsername(account.username);
      setBaristaNewPassword("");
      setBaristaRepeatPassword("");
      setBaristaFeedback({
        kind: "success",
        message: "Данные доступа бариста обновлены. Активные сессии завершены.",
      });
    } catch (error) {
      setBaristaFeedback({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Не удалось сохранить изменения.",
      });
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <section className="rounded-[32px] border border-[#E6E6E6] bg-white p-5 shadow-[0_18px_44px_rgba(26,26,26,0.05)] sm:p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#E30613]">
          Настройки аккаунтов
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight">
          Доступ и безопасность
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#777777]">
          Изменение данных завершает активные сессии выбранной роли. Пароли в
          интерфейсе не отображаются и после сохранения очищаются.
        </p>
      </div>

      {isLoading ? (
        <p className="mt-6 rounded-2xl bg-[#F7F7F7] px-4 py-5 text-sm font-bold text-[#777777]">
          Загружаем данные доступа…
        </p>
      ) : null}

      {loadingError ? (
        <div className="mt-6 rounded-2xl border border-[#F0C9C5] bg-[#FFF4F2] px-4 py-4">
          <p className="text-sm font-bold text-[#8F2F24]" role="alert">
            {loadingError}
          </p>
          <button
            className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-black text-[#E30613]"
            onClick={() => void loadAccounts()}
            type="button"
          >
            Повторить
          </button>
        </div>
      ) : null}

      {accounts ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <CredentialForm
            currentUsername={accounts.admin.username}
            feedback={adminFeedback}
            isSaving={savingRole === "admin"}
            role="admin"
            title="Администратор"
            onSubmit={submitAdmin}
          >
            <CredentialField
              autoComplete="username"
              id="security-admin-username"
              label="Новый логин"
              value={adminUsername}
              onChange={setAdminUsername}
            />
            <CredentialField
              autoComplete="current-password"
              id="security-admin-current-password"
              label="Текущий пароль"
              note="Нужен только при смене пароля."
              type="password"
              value={adminCurrentPassword}
              onChange={setAdminCurrentPassword}
            />
            <CredentialField
              autoComplete="new-password"
              id="security-admin-new-password"
              label="Новый пароль"
              note={`Не менее ${AUTH_PASSWORD_MIN_LENGTH} символов. Оставьте пустым, чтобы не менять.`}
              type="password"
              value={adminNewPassword}
              onChange={setAdminNewPassword}
            />
            <CredentialField
              autoComplete="new-password"
              id="security-admin-repeat-password"
              label="Повтор нового пароля"
              type="password"
              value={adminRepeatPassword}
              onChange={setAdminRepeatPassword}
            />
          </CredentialForm>

          <CredentialForm
            currentUsername={accounts.barista.username}
            feedback={baristaFeedback}
            isSaving={savingRole === "barista"}
            role="barista"
            title="Бариста"
            onSubmit={submitBarista}
          >
            <CredentialField
              autoComplete="username"
              id="security-barista-username"
              label="Новый логин"
              value={baristaUsername}
              onChange={setBaristaUsername}
            />
            <CredentialField
              autoComplete="new-password"
              id="security-barista-new-password"
              label="Новый пароль"
              note={`Не менее ${AUTH_PASSWORD_MIN_LENGTH} символов. Оставьте пустым, чтобы не менять.`}
              type="password"
              value={baristaNewPassword}
              onChange={setBaristaNewPassword}
            />
            <CredentialField
              autoComplete="new-password"
              id="security-barista-repeat-password"
              label="Повтор нового пароля"
              type="password"
              value={baristaRepeatPassword}
              onChange={setBaristaRepeatPassword}
            />
          </CredentialForm>
        </div>
      ) : null}
    </section>
  );
}

function CredentialForm({
  children,
  currentUsername,
  feedback,
  isSaving,
  onSubmit,
  role,
  title,
}: {
  children: React.ReactNode;
  currentUsername: string;
  feedback: Feedback;
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  role: AuthRole;
  title: string;
}) {
  return (
    <form
      className="rounded-3xl border border-[#E6E6E6] bg-[#FCFCFC] p-4 sm:p-5"
      onSubmit={onSubmit}
    >
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#777777]">
        {title}
      </p>
      <div className="mt-4 rounded-2xl border border-[#E6E6E6] bg-white px-4 py-3">
        <p className="text-xs font-bold text-[#777777]">Текущий логин</p>
        <p className="mt-1 break-all font-black" data-testid={`${role}-current-username`}>
          {currentUsername}
        </p>
      </div>
      <fieldset className="mt-4 space-y-4" disabled={isSaving}>
        {children}
      </fieldset>
      <div className="mt-4 min-h-6" aria-live="polite">
        {feedback ? (
          <p
            className={`text-sm font-bold ${
              feedback.kind === "success" ? "text-[#226B35]" : "text-[#8F2F24]"
            }`}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
      <button
        className="mt-2 h-12 w-full rounded-2xl bg-[#E30613] px-5 font-black text-white transition hover:bg-[#C9000B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E30613] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Сохраняем…" : "Сохранить"}
      </button>
    </form>
  );
}

function CredentialField({
  autoComplete,
  id,
  label,
  note,
  onChange,
  type = "text",
  value,
}: {
  autoComplete: string;
  id: string;
  label: string;
  note?: string;
  onChange: (value: string) => void;
  type?: "password" | "text";
  value: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-sm font-bold text-[#1A1A1A]">{label}</span>
      <input
        autoCapitalize={type === "text" ? "none" : undefined}
        autoComplete={autoComplete}
        className="mt-2 h-12 w-full rounded-2xl border border-[#E6E6E6] bg-white px-4 font-semibold outline-none transition focus:border-[#E30613] disabled:bg-[#F2F2F2]"
        id={id}
        maxLength={type === "password" ? 1_024 : 128}
        spellCheck={type === "text" ? false : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {note ? <span className="mt-1 block text-xs text-[#777777]">{note}</span> : null}
    </label>
  );
}

async function updateAccount(input: {
  role: AuthRole;
  username: string;
  currentPassword?: string;
  newPassword: string;
  repeatPassword: string;
}) {
  const response = await fetch("/api/admin/auth/accounts", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    account?: SafeAuthAccount;
    error?: string;
  };
  if (!response.ok || !payload.account) {
    throw new Error(payload.error || "Не удалось сохранить изменения.");
  }
  return payload.account;
}

function validateCredentials(input: {
  currentUsername: string;
  username: string;
  currentPassword?: string;
  newPassword: string;
  repeatPassword: string;
  requireCurrentPassword: boolean;
}) {
  const username = normalizeAuthUsername(input.username);
  if (!username) {
    return "Логин: 3–64 символа, латинские буквы, цифры, точка, дефис или подчёркивание.";
  }
  if (input.newPassword !== input.repeatPassword) {
    return "Новый пароль и повтор не совпадают.";
  }
  if (input.newPassword && !isValidAuthPassword(input.newPassword)) {
    return "Новый пароль должен содержать от 12 до 1024 символов.";
  }
  if (input.requireCurrentPassword && input.newPassword && !input.currentPassword) {
    return "Введите текущий пароль администратора.";
  }
  if (!input.newPassword && username === input.currentUsername) {
    return "Нет изменений для сохранения.";
  }
  return "";
}
