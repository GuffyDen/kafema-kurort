"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createIikoSyncSummary,
  iikoReadOnlyRequests,
  type IikoConnectionResult,
} from "@/lib/iikoReadOnlyProvider";
import {
  getStoredBaristaSettings,
  saveBaristaSettings,
  type BaristaSettings,
} from "@/lib/baristaSettings";
import { useMenu, type MenuItem } from "@/lib/menuStore";

type AdminSection = "connections" | "storefront" | "barista" | "qr" | "settings";

type StorefrontOverlay = {
  displayName: string;
  description: string;
  imageSrc: string;
  visible: boolean;
  badgeHit: boolean;
  badgeNew: boolean;
  sortOrder: number;
};

type StorefrontOverlayState = Record<string, StorefrontOverlay>;

type GeneralSettings = {
  coffeehouseName: string;
  logoLabel: string;
  themeColor: string;
  banners: string;
  contacts: string;
};

type IikoWebhookStatus = {
  status: string;
  message: string;
  webhookUrl: string;
  tokenConfigured: boolean;
  warning: string | null;
  totalRequests: number;
  totalReceived: number;
  totalErrors: number;
  lastWebhookReceivedAt: string | null;
  lastEventType: string | null;
  lastOrderId: string | null;
  lastPosId: string | null;
  lastOrderStatus: string | null;
  lastTerminalGroupId: string | null;
  lastOrganizationId: string | null;
  lastCorrelationId: string | null;
  lastHttpStatus: string | null;
  lastClientIp: string | null;
  lastUserAgent: string | null;
  lastError: string | null;
  lastPayload: unknown | null;
  lastMessage: unknown | null;
  requests: IikoWebhookRequestLog[];
};

type IikoCheckDiagnostics = {
  ok: boolean;
  authVersion: "v2";
  tokenReceived: boolean;
  authHttpStatus?: number | null;
  authError?: string | null;
  organizationsCount?: number;
  terminalGroupsCount?: number;
  terminalGroupFound?: boolean;
  selectedOrganizationName: string | null;
  selectedTerminalGroupName: string | null;
  categoriesCount: number;
  productsCount: number;
  modifiersCount: number;
  menuReceived: boolean;
  rawErrors?: unknown[];
  cache?: {
    status: string;
    checkedAt?: string;
    warning?: string;
  };
};

type IikoWebhookRequestLog = {
  id: string;
  receivedAt: string;
  method: string;
  path: string;
  clientIp: string | null;
  userAgent: string | null;
  contentType: string | null;
  hasAuthorization: boolean;
  hasHeaderToken: boolean;
  hasQueryToken: boolean;
  httpStatus: number;
  httpStatusText: string;
  success: boolean;
  error: string | null;
  eventType: string | null;
  orderId: string | null;
  posId: string | null;
  orderStatus: string | null;
  terminalGroupId: string | null;
  organizationId: string | null;
  correlationId: string | null;
  rawBody: string | null;
  parsedJson: unknown | null;
  headers: Record<string, string | boolean | null>;
};

const navItems: Array<{ id: AdminSection; label: string; hint: string }> = [
  { id: "connections", label: "Интеграции", hint: "iiko, платежи, Tablo" },
  { id: "storefront", label: "Витрина", hint: "Отображение меню" },
  { id: "barista", label: "Бариста", hint: "Рабочее место" },
  { id: "qr", label: "QR", hint: "Точки входа" },
  { id: "settings", label: "Настройки", hint: "Бренд и контакты" },
];

const overlayStorageKey = "kafema-storefront-overlay-v1";

export function ManagePanel() {
  const menu = useMenu();
  const [activeSection, setActiveSection] = useState<AdminSection>("connections");
  const [isCheckingIiko, setIsCheckingIiko] = useState(false);
  const [iikoResult, setIikoResult] = useState<IikoConnectionResult | null>(null);
  const [iikoDiagnostics, setIikoDiagnostics] =
    useState<IikoCheckDiagnostics | null>(null);
  const [iikoError, setIikoError] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<IikoWebhookStatus | null>(null);
  const [webhookCheckedAt, setWebhookCheckedAt] = useState<Date | null>(null);
  const [showEnvModeWarning, setShowEnvModeWarning] = useState(false);
  const [overlays, setOverlays] = useState<StorefrontOverlayState>(() =>
    getStoredOverlays(),
  );
  const [baristaSettings, setBaristaSettingsState] = useState<BaristaSettings>(() =>
    getStoredBaristaSettings(),
  );
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    coffeehouseName: "Кафема Курорт",
    logoLabel: "КАФЕМА КУРОРТ",
    themeColor: "#C79A5B",
    banners: "Утренний кофе, сезонные напитки, десерты к выдаче",
    contacts: "+7 (914) 234-56-78",
  });

  const syncSummary = useMemo(() => createIikoSyncSummary(menu), [menu]);

  useEffect(() => {
    void refreshWebhookStatus();
  }, []);

  async function refreshWebhookStatus(): Promise<IikoWebhookStatus | null> {
    try {
      const response = await fetch("/api/iiko/webhook-monitor", { cache: "no-store" });
      const nextStatus = (await response.json()) as IikoWebhookStatus;
      setWebhookStatus(nextStatus);
      setWebhookCheckedAt(new Date());
      return nextStatus;
    } catch {
      const errorStatus: IikoWebhookStatus = {
        status: "error",
        message: "Не удалось получить статус событий iiko",
        webhookUrl: "https://kafema-kurort.vercel.app/api/iiko/webhook",
        tokenConfigured: false,
        warning: null,
        totalRequests: 0,
        totalReceived: 0,
        totalErrors: 0,
        lastWebhookReceivedAt: null,
        lastEventType: null,
        lastOrderId: null,
        lastPosId: null,
        lastOrderStatus: null,
        lastTerminalGroupId: null,
        lastOrganizationId: null,
        lastCorrelationId: null,
        lastHttpStatus: null,
        lastClientIp: null,
        lastUserAgent: null,
        lastError: "Не удалось получить статус событий iiko",
        lastPayload: null,
        lastMessage: null,
        requests: [],
      };
      setWebhookStatus(errorStatus);
      setWebhookCheckedAt(new Date());
      return null;
    }
  }

  async function clearWebhookJournal() {
    try {
      await fetch("/api/iiko/webhook-monitor", { method: "DELETE" });
      await refreshWebhookStatus();
    } catch {
      setWebhookStatus((current) => ({
        status: current?.status ?? "error",
        message: current?.message ?? "Не удалось очистить журнал iiko",
        webhookUrl:
          current?.webhookUrl ?? "https://kafema-kurort.vercel.app/api/iiko/webhook",
        tokenConfigured: current?.tokenConfigured ?? false,
        warning: current?.warning ?? null,
        totalRequests: current?.totalRequests ?? 0,
        totalReceived: current?.totalReceived ?? 0,
        totalErrors: current?.totalErrors ?? 0,
        lastWebhookReceivedAt: current?.lastWebhookReceivedAt ?? null,
        lastEventType: current?.lastEventType ?? null,
        lastOrderId: current?.lastOrderId ?? null,
        lastPosId: current?.lastPosId ?? null,
        lastOrderStatus: current?.lastOrderStatus ?? null,
        lastTerminalGroupId: current?.lastTerminalGroupId ?? null,
        lastOrganizationId: current?.lastOrganizationId ?? null,
        lastCorrelationId: current?.lastCorrelationId ?? null,
        lastHttpStatus: current?.lastHttpStatus ?? null,
        lastClientIp: current?.lastClientIp ?? null,
        lastUserAgent: current?.lastUserAgent ?? null,
        lastPayload: current?.lastPayload ?? null,
        lastMessage: current?.lastMessage ?? null,
        requests: current?.requests ?? [],
        lastError: "Не удалось очистить журнал iiko",
      }));
    }
  }

  async function checkIikoConnection() {
    setIsCheckingIiko(true);
    setIikoError("");
    setShowEnvModeWarning(true);

    try {
      const response = await fetch("/api/iiko/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as
        | {
            ok: true;
            result: IikoConnectionResult;
            diagnostics?: IikoCheckDiagnostics;
          }
        | {
            ok: false;
            error: string;
            diagnostics?: IikoCheckDiagnostics;
          };

      setIikoDiagnostics(payload.diagnostics ?? null);

      if (!response.ok) {
        throw new Error("Сервер диагностики iiko не ответил корректно");
      }

      if (!payload.ok) {
        throw new Error(payload.error);
      }

      const result = payload.result;
      setIikoResult(result);
    } catch (error) {
      setIikoResult(null);
      setIikoError(
        error instanceof Error
          ? error.message
          : "Не удалось проверить iiko.",
      );
    } finally {
      setIsCheckingIiko(false);
    }
  }

  function updateOverlay(item: MenuItem, patch: Partial<StorefrontOverlay>) {
    setOverlays((current) => {
      const next = {
        ...current,
        [item.id]: {
          ...createDefaultOverlay(item),
          ...current[item.id],
          ...patch,
        },
      };
      localStorage.setItem(overlayStorageKey, JSON.stringify(next));
      return next;
    });
  }

  function setBaristaSettings(settings: BaristaSettings) {
    setBaristaSettingsState(settings);
    saveBaristaSettings(settings);
  }

  return (
    <main className="min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-[280px_1fr]">
        <aside className="border-r border-[#E6E6E6] bg-white px-5 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#F7F7F7] shadow-[0_12px_28px_rgba(26,26,26,0.08)]">
              <Image
                alt="Tablo"
                className="h-full w-full object-contain p-2"
                height={48}
                priority
                src="/tablo-logo.png"
                width={48}
              />
            </div>
            <div>
              <p className="text-2xl font-black tracking-tight">Tablo</p>
              <p className="mt-1 text-sm text-[#777777]">Панель управления</p>
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            {navItems.map((item) => (
              <button
                type="button"
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                  activeSection === item.id
                    ? "bg-[#E30613] text-white shadow-[0_14px_28px_rgba(227,6,19,0.18)]"
                    : "bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#EFEFEF]"
                }`}
                key={item.id}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="block text-base font-bold">{item.label}</span>
                <span
                  className={`mt-1 block text-xs ${
                    activeSection === item.id ? "text-white/75" : "text-[#777777]"
                  }`}
                >
                  {item.hint}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 px-8 py-6">
          <header className="mb-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#E30613]">
                {navItems.find((item) => item.id === activeSection)?.label}
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">
                {getPageTitle(activeSection)}
              </h1>
              <p className="mt-2 max-w-3xl text-base leading-7 text-[#777777]">
                {getPageDescription(activeSection)}
              </p>
            </div>
            <StatusPill connected={Boolean(iikoResult)} />
          </header>

          {activeSection === "connections" ? (
            <ConnectionsSection
              iikoError={iikoError}
              iikoDiagnostics={iikoDiagnostics}
              iikoResult={iikoResult}
              isCheckingIiko={isCheckingIiko}
              showEnvModeWarning={showEnvModeWarning}
              syncSummary={syncSummary}
              webhookCheckedAt={webhookCheckedAt}
              webhookStatus={webhookStatus}
              onCheckIiko={checkIikoConnection}
              onClearWebhook={clearWebhookJournal}
              onRefreshWebhook={refreshWebhookStatus}
            />
          ) : null}

          {activeSection === "storefront" ? (
            <StorefrontSection
              menuItems={menu.menuItems}
              categories={menu.categories}
              addonGroups={menu.addonGroups}
              overlays={overlays}
              updateOverlay={updateOverlay}
            />
          ) : null}

          {activeSection === "barista" ? (
            <BaristaSection
              settings={baristaSettings}
              setSettings={setBaristaSettings}
            />
          ) : null}

          {activeSection === "qr" ? <QrSection /> : null}

          {activeSection === "settings" ? (
            <SettingsSection
              settings={generalSettings}
              setSettings={setGeneralSettings}
            />
          ) : null}

        </section>
      </div>
    </main>
  );
}

function ConnectionsSection({
  iikoError,
  iikoDiagnostics,
  iikoResult,
  isCheckingIiko,
  showEnvModeWarning,
  syncSummary,
  webhookCheckedAt,
  webhookStatus,
  onCheckIiko,
  onClearWebhook,
  onRefreshWebhook,
}: {
  iikoError: string;
  iikoDiagnostics: IikoCheckDiagnostics | null;
  iikoResult: IikoConnectionResult | null;
  isCheckingIiko: boolean;
  showEnvModeWarning: boolean;
  syncSummary: {
    products: number;
    categories: number;
    modifiers: number;
    terminalGroups: number;
    stopLists: number;
  };
  webhookCheckedAt: Date | null;
  webhookStatus: IikoWebhookStatus | null;
  onCheckIiko: () => void;
  onClearWebhook: () => void;
  onRefreshWebhook: () => Promise<IikoWebhookStatus | null>;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <IikoCloudApiCard
          diagnostics={iikoDiagnostics}
          error={iikoError}
          isChecking={isCheckingIiko}
          result={iikoResult}
          showEnvModeWarning={showEnvModeWarning}
          onCheck={onCheckIiko}
        />
        <IikoWebhookCard
          lastCheckedAt={webhookCheckedAt}
          status={webhookStatus}
          onClear={onClearWebhook}
          onRefresh={onRefreshWebhook}
        />
        <YookassaIntegrationCard />
        <TabloIntegrationCard />
      </div>

      <DeveloperDiagnostics diagnostics={iikoDiagnostics} summary={syncSummary} />
    </div>
  );
}

function IikoCloudApiCard({
  diagnostics,
  error,
  isChecking,
  result,
  showEnvModeWarning,
  onCheck,
}: {
  diagnostics: IikoCheckDiagnostics | null;
  error: string;
  isChecking: boolean;
  result: IikoConnectionResult | null;
  showEnvModeWarning: boolean;
  onCheck: () => void;
}) {
  const tokenReceived = diagnostics?.tokenReceived ?? result?.tokenReceived ?? false;
  const organizationName =
    diagnostics?.selectedOrganizationName ?? result?.organization.name ?? "Не проверено";
  const terminalGroupName =
    diagnostics?.selectedTerminalGroupName ??
    result?.organization.terminalGroupId ??
    "Не проверено";
  const categoriesCount = diagnostics?.categoriesCount ?? result?.summary.categories ?? 0;
  const productsCount = diagnostics?.productsCount ?? result?.summary.products ?? 0;
  const modifiersCount = diagnostics?.modifiersCount ?? result?.summary.modifiers ?? 0;
  const authVersion = diagnostics?.authVersion ?? "v2";
  const connected = Boolean(tokenReceived && result && !error);
  const productsMissing = connected && productsCount === 0;

  return (
    <Card>
      <IntegrationCardHeader
        description="Read-only проверка меню, организации и терминальной группы."
        status={error ? "Ошибка" : connected ? "Подключено" : "Не проверено"}
        title="iiko Cloud API"
        tone={error ? "danger" : connected ? "success" : "neutral"}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Info label="authVersion" value={authVersion} />
        <Info label="tokenReceived" value={tokenReceived ? "true" : "false"} />
        <Info label="Организация" value={organizationName} />
        <Info label="Terminal group" value={terminalGroupName} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <CompactMetric label="Категории" value={categoriesCount} />
        <CompactMetric label="Товары" value={productsCount} />
        <CompactMetric label="Модификаторы" value={modifiersCount} />
      </div>

      {productsMissing ? (
        <div className="mt-5 rounded-3xl bg-[#FFF4D7] p-4 text-sm font-bold leading-6 text-[#8A6500]">
          <p>Авторизация успешна.</p>
          <p>Организация найдена.</p>
          <p>Терминальная группа найдена.</p>
          <p>iiko не возвращает товары.</p>
          <p>Категорий: {categoriesCount}.</p>
          <p>Товаров: 0.</p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-5 rounded-3xl bg-[#FFE7E7] p-4 text-sm font-bold leading-6 text-[#B00020]">
          {error}
        </p>
      ) : null}

      <PrimaryButton onClick={onCheck} disabled={isChecking}>
        {isChecking ? "Проверяем..." : "Проверить подключение"}
      </PrimaryButton>

      <details className="mt-5 rounded-3xl border border-[#E9E1D7] bg-[#FFFDF8] p-4">
        <summary className="cursor-pointer text-sm font-black text-[#3B2F2A]">
          Технические детали
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="Secrets" value="Только server env" />
          <Info label="App credentials" value="Tablo" />
          <Info label="Tenant credentials" value="Кафема Санаторная" />
          <Info label="Меню получено" value={diagnostics?.menuReceived ? "Да" : "Нет"} />
          <Info label="Cache" value={diagnostics?.cache?.status ?? "Нет данных"} />
          <Info
            label="Env mode"
            value={showEnvModeWarning ? "server env" : "Не показывался"}
          />
        </div>
        {diagnostics?.cache?.warning ? (
          <p className="mt-3 rounded-2xl bg-[#F7F7F7] p-3 text-xs font-bold leading-5 text-[#777777]">
            {diagnostics.cache.warning}
          </p>
        ) : null}
      </details>
    </Card>
  );
}

function IikoWebhookCard({
  lastCheckedAt,
  status,
  onClear,
  onRefresh,
}: {
  lastCheckedAt: Date | null;
  status: IikoWebhookStatus | null;
  onClear: () => void;
  onRefresh: () => Promise<IikoWebhookStatus | null>;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<IikoWebhookRequestLog | null>(null);
  const [refreshState, setRefreshState] = useState<
    "idle" | "loading" | "updated" | "no-events" | "error"
  >("idle");
  const refreshResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const webhookUrl =
    status?.webhookUrl ?? "https://kafema-kurort.vercel.app/api/iiko/webhook";
  const totalRequests = status?.totalRequests ?? status?.totalReceived ?? 0;
  const totalReceived = status?.totalReceived ?? 0;
  const totalErrors = status?.totalErrors ?? 0;
  const hasRequests = totalRequests > 0;
  const hasSuccessfulEvents = totalReceived > 0;
  const payloadForViewer = status?.lastPayload ?? status?.lastMessage ?? null;
  const requestJournal = status?.requests ?? [];
  const lastStatus = status?.lastHttpStatus ?? "Нет";
  const refreshLabel =
    refreshState === "loading"
      ? "Обновление..."
      : refreshState === "updated"
        ? "Монитор обновлен"
        : refreshState === "no-events"
          ? "Новых событий нет"
          : refreshState === "error"
            ? "Не удалось обновить"
            : "Обновить монитор";

  useEffect(() => {
    return () => {
      if (refreshResetTimer.current) clearTimeout(refreshResetTimer.current);
    };
  }, []);

  async function handleRefresh() {
    if (refreshState === "loading") return;

    if (refreshResetTimer.current) clearTimeout(refreshResetTimer.current);

    const previousRequestsCount = totalRequests;
    setRefreshState("loading");

    const nextStatus = await onRefresh();

    if (!nextStatus) {
      setRefreshState("error");
    } else {
      const nextRequestsCount = nextStatus.totalRequests ?? nextStatus.totalReceived ?? 0;
      setRefreshState(
        nextRequestsCount > previousRequestsCount ? "updated" : "no-events",
      );
    }

    refreshResetTimer.current = setTimeout(() => {
      setRefreshState("idle");
      refreshResetTimer.current = null;
    }, 2400);
  }

  return (
    <Card>
      <IntegrationCardHeader
        description="Входящие события от iiko и журнал обращений к webhook."
        status={
          hasSuccessfulEvents ? "Принимает события" : hasRequests ? "Есть обращения" : "Готов"
        }
        title="iiko Webhook"
        tone={hasSuccessfulEvents ? "success" : hasRequests ? "warning" : "neutral"}
      />

      <div className="mt-5 space-y-3">
        <Info label="Webhook URL" value={webhookUrl} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="tokenConfigured" value={status?.tokenConfigured ? "true" : "false"} />
          <Info
            label="lastWebhookReceivedAt"
            value={formatWebhookDate(status?.lastWebhookReceivedAt)}
          />
          <Info label="lastEventType" value={status?.lastEventType ?? "Unknown"} />
          <Info label="lastOrderId" value={status?.lastOrderId ?? "Нет"} />
          <Info
            label="Последний terminal group"
            value={status?.lastTerminalGroupId ?? "Нет"}
          />
          <Info
            label="Последний статус заказа"
            value={status?.lastOrderStatus ?? "Нет"}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <CompactMetric label="Обращения" value={totalRequests} />
        <CompactMetric label="Принято" value={totalReceived} />
        <CompactMetric label="Ошибки" value={totalErrors} />
      </div>

      {!hasRequests ? (
        <p className="mt-5 rounded-3xl bg-[#F7F7F7] p-4 text-sm font-bold leading-6 text-[#777777]">
          Ожидаем первое событие от iiko.
          <span className="mt-2 block">
            Как только в iiko будет создан заказ, он автоматически появится здесь.
          </span>
        </p>
      ) : totalReceived === 0 ? (
        <p className="mt-5 rounded-3xl bg-[#FFF4D7] p-4 text-sm font-bold leading-6 text-[#8A6500]">
          iiko или клиент обращается к webhook, но запросы не проходят проверку.
          Смотрите журнал ошибок в технических деталях.
        </p>
      ) : null}

      <div className="mt-5">
        <div className="flex flex-wrap gap-3">
          <PrimaryButton
            disabled={refreshState === "loading"}
            onClick={() => void handleRefresh()}
          >
            <span className="inline-flex items-center gap-2" aria-live="polite">
              {refreshState === "loading" ? (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                />
              ) : null}
              {refreshLabel}
            </span>
          </PrimaryButton>
          {hasRequests ? (
            <SecondaryButton onClick={onClear}>Очистить журнал</SecondaryButton>
          ) : null}
        </div>
        <p className="mt-2 text-xs font-bold text-[#777777]">
          Последняя проверка: {formatWebhookCheckTime(lastCheckedAt)}
        </p>
      </div>

      <details className="mt-5 rounded-3xl border border-[#E9E1D7] bg-[#FFFDF8] p-4">
        <summary className="cursor-pointer text-sm font-black text-[#3B2F2A]">
          Технические детали
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Info label="Последний HTTP Status" value={lastStatus} />
          <Info label="Последний IP" value={status?.lastClientIp ?? "Нет"} />
          <Info label="Последний User-Agent" value={status?.lastUserAgent ?? "Нет"} />
          <Info label="Последняя ошибка" value={status?.lastError ?? "Нет"} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <SecondaryButton
            disabled={!payloadForViewer}
            onClick={() => payloadForViewer && setShowPayload(true)}
          >
            Показать последнее сообщение
          </SecondaryButton>
        </div>

        {requestJournal.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#777777]">
              Последние обращения
            </p>
            {requestJournal.slice(0, 20).map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="w-full rounded-2xl bg-[#F7F7F7] p-3 text-left text-sm font-bold transition hover:bg-[#EFEFEF]"
                onClick={() => setSelectedRequest(entry)}
              >
                <span className="block text-[#3B2F2A]">
                  {formatWebhookDate(entry.receivedAt)} · {entry.method} · {entry.httpStatus}
                </span>
                <span className="mt-1 block text-xs text-[#777777]">
                  {entry.success ? "success" : "error"} · {entry.eventType ?? "Unknown"}
                  {entry.orderId ? " · " + entry.orderId : ""}
                  {entry.error ? " · " + entry.error : ""}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </details>

      {showPayload ? (
        <JsonViewerModal
          payload={payloadForViewer}
          title="Последнее сообщение iiko"
          onClose={() => setShowPayload(false)}
        />
      ) : null}
      {selectedRequest ? (
        <JsonViewerModal
          payload={selectedRequest}
          title="Детали обращения к webhook"
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
    </Card>
  );
}

function YookassaIntegrationCard() {
  return (
    <Card>
      <IntegrationCardHeader
        description="Оплата будет подключена позже. Сейчас API-запросы не выполняются."
        status="Не подключено"
        title="ЮKassa"
        tone="neutral"
      />
      <div className="mt-5 rounded-3xl bg-[#F7F7F7] p-4">
        <p className="text-base font-black text-[#3B2F2A]">Оплата будет подключена позже</p>
        <p className="mt-2 text-sm font-bold leading-6 text-[#777777]">
          Карточка оставлена как место будущего подключения. ENV, платежные запросы
          и логика оплаты здесь не используются.
        </p>
      </div>
    </Card>
  );
}

function TabloIntegrationCard() {
  return (
    <Card>
      <IntegrationCardHeader
        description="Платформа заказов, витрины, экрана бариста и интеграций."
        status="pilot"
        title="Tablo"
        tone="success"
      />
      <div className="mt-5 flex items-center gap-4 rounded-3xl bg-[#F7F7F7] p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-sm">
          <Image src="/tablo-logo.png" alt="Tablo" width={56} height={56} />
        </div>
        <div>
          <p className="text-base font-black text-[#3B2F2A]">
            Платформа заказов и экрана бариста
          </p>
          <p className="mt-1 text-sm font-bold text-[#777777]">
            Текущий клиент: Кафема Санаторная
          </p>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.18em] text-[#C78A45]">
            pilot
          </p>
        </div>
      </div>
    </Card>
  );
}

function DeveloperDiagnostics({
  diagnostics,
  summary,
}: {
  diagnostics: IikoCheckDiagnostics | null;
  summary: {
    products: number;
    categories: number;
    modifiers: number;
    terminalGroups: number;
    stopLists: number;
  };
}) {
  return (
    <details className="rounded-[28px] border border-[#E9E1D7] bg-white p-5 shadow-[0_18px_50px_rgba(36,24,16,0.08)]">
      <summary className="cursor-pointer text-base font-black text-[#3B2F2A]">
        Технические детали
      </summary>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl bg-[#F7F7F7] p-4">
          <p className="text-sm font-black text-[#3B2F2A]">iiko request audit</p>
          <ul className="mt-3 space-y-2 text-sm font-bold text-[#777777]">
            {iikoReadOnlyRequests.map((request) => (
              <li key={request.endpoint}>
                {request.method} {request.endpoint} · {request.mode}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-[#F7F7F7] p-4">
          <p className="text-sm font-black text-[#3B2F2A]">Последняя локальная сводка</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <CompactMetric label="Товары" value={summary.products} />
            <CompactMetric label="Категории" value={summary.categories} />
            <CompactMetric label="Модификаторы" value={summary.modifiers} />
            <CompactMetric label="Terminal groups" value={summary.terminalGroups} />
          </div>
        </div>
      </div>
      {diagnostics?.rawErrors && diagnostics.rawErrors.length > 0 ? (
        <pre className="mt-5 max-h-72 overflow-auto rounded-3xl bg-[#111827] p-4 text-xs font-semibold leading-6 text-[#E5E7EB]">
          {JSON.stringify(diagnostics.rawErrors, null, 2)}
        </pre>
      ) : null}
    </details>
  );
}

function IntegrationCardHeader({
  description,
  status,
  title,
  tone,
}: {
  description: string;
  status: string;
  title: string;
  tone: "danger" | "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-[#CFE8D4] bg-[#ECF8EF] text-[#226B35]"
      : tone === "warning"
        ? "border-[#F1D7A6] bg-[#FFF4D7] text-[#8A6500]"
        : tone === "danger"
          ? "border-[#F3B8B8] bg-[#FFE7E7] text-[#B00020]"
          : "border-[#E9E1D7] bg-[#F7F7F7] text-[#777777]";

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-black text-[#3B2F2A]">{title}</h2>
        <p className="mt-1 text-sm font-bold leading-6 text-[#777777]">{description}</p>
      </div>
      <span className={"shrink-0 rounded-full border px-3 py-1 text-xs font-black " + toneClass}>
        {status}
      </span>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#F7F7F7] p-3">
      <p className="text-xl font-black text-[#3B2F2A]">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#777777]">{label}</p>
    </div>
  );
}

function JsonViewerModal({
  onClose,
  payload,
  title = "Последнее сообщение iiko",
}: {
  onClose: () => void;
  payload: unknown;
  title?: string;
}) {
  const formattedPayload = useMemo(
    () => JSON.stringify(payload ?? {}, null, 2),
    [payload],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/30 px-4 py-8 backdrop-blur-sm">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-[32px] bg-white shadow-[0_28px_90px_rgba(26,26,26,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#E6E6E6] px-5 py-4">
          <div>
            <h3 className="text-2xl font-black">{title}</h3>
            <p className="mt-1 text-sm font-bold text-[#777777]">
              Полный payload без сокращений.
            </p>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-2xl bg-[#F7F7F7] px-4 font-black transition hover:bg-[#EFEFEF]"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        <pre className="max-h-[68vh] overflow-auto bg-[#111827] p-5 text-xs font-semibold leading-6 text-[#E5E7EB]">
          {formattedPayload}
        </pre>
      </div>
    </div>
  );
}

function formatWebhookDate(value?: string | null) {
  if (!value) return "Нет";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatWebhookCheckTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}

function StorefrontSection({
  menuItems,
  categories,
  addonGroups,
  overlays,
  updateOverlay,
}: {
  menuItems: MenuItem[];
  categories: Array<{ id: string; name: string }>;
  addonGroups: Array<{ id: string; name: string }>;
  overlays: StorefrontOverlayState;
  updateOverlay: (item: MenuItem, patch: Partial<StorefrontOverlay>) => void;
}) {
  return (
    <div className="space-y-4">
      <Notice>
        Товары приходят из iiko. В Kafema настраивается только витринный слой:
        фото, красивое название, описание, видимость, бейджи и сортировка.
      </Notice>

      <div className="grid gap-4">
        {[...menuItems].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => {
          const overlay = { ...createDefaultOverlay(item), ...overlays[item.id] };
          const category = categories.find((entry) => entry.id === item.categoryId);
          const modifierIds = item.addonGroupIds
            .map((id) => addonGroups.find((group) => group.id === id)?.id ?? id)
            .map((id) => `iiko-modifier-${id}`);

          return (
            <Card key={item.id}>
              <div className="grid gap-5 xl:grid-cols-[160px_1fr]">
                <div>
                  <div className="aspect-square overflow-hidden rounded-3xl bg-[#F7F7F7]">
                    <img
                      alt={overlay.displayName}
                      className="h-full w-full object-cover"
                      src={overlay.imageSrc}
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <TextField
                    label="Название для сайта"
                    value={overlay.displayName}
                    onChange={(displayName) => updateOverlay(item, { displayName })}
                  />
                  <TextField
                    label="Фото"
                    value={overlay.imageSrc}
                    onChange={(imageSrc) => updateOverlay(item, { imageSrc })}
                  />
                  <TextArea
                    label="Описание"
                    value={overlay.description}
                    onChange={(description) => updateOverlay(item, { description })}
                  />
                  <div className="space-y-3">
                    <TextField
                      label="Сортировка"
                      value={String(overlay.sortOrder)}
                      onChange={(sortOrder) =>
                        updateOverlay(item, {
                          sortOrder: Number(sortOrder) || item.sortOrder,
                        })
                      }
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Toggle
                        active={overlay.visible}
                        label={overlay.visible ? "Показывать" : "Скрыто"}
                        onClick={() => updateOverlay(item, { visible: !overlay.visible })}
                      />
                      <Toggle
                        active={overlay.badgeHit}
                        label="Хит"
                        onClick={() => updateOverlay(item, { badgeHit: !overlay.badgeHit })}
                      />
                      <Toggle
                        active={overlay.badgeNew}
                        label="Новинка"
                        onClick={() => updateOverlay(item, { badgeNew: !overlay.badgeNew })}
                      />
                    </div>
                  </div>

                  <details className="lg:col-span-2 rounded-3xl bg-[#F7F7F7] p-4">
                    <summary className="cursor-pointer text-sm font-black text-[#777777]">
                      Техническая информация
                    </summary>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <Info label="iikoProductId" value={getIikoProductId(item)} />
                      <Info label="iikoCategoryId" value={getIikoCategoryId(item)} />
                      <Info
                        label="iikoModifierId"
                        value={modifierIds.length ? modifierIds.join(", ") : "Нет"}
                      />
                      <Info label="Категория из iiko" value={category?.name ?? "Не найдена"} />
                    </div>
                  </details>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function BaristaSection({
  settings,
  setSettings,
}: {
  settings: BaristaSettings;
  setSettings: (settings: BaristaSettings) => void;
}) {
  return (
    <Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsToggle
          active={settings.showSource}
          title="Показывать источник заказа"
          description="ONLINE / CASHIER / DELIVERY в карточке бариста."
          onClick={() => setSettings({ ...settings, showSource: !settings.showSource })}
        />
        <SettingsToggle
          active={settings.sound}
          title="Звук нового заказа"
          description="Сигнал для оплаченного онлайн-заказа."
          onClick={() => setSettings({ ...settings, sound: !settings.sound })}
        />
        <SettingsToggle
          active={settings.autoScroll}
          title="Автоскролл"
          description="Новые заказы остаются в зоне внимания."
          onClick={() => setSettings({ ...settings, autoScroll: !settings.autoScroll })}
        />
        <div className="rounded-3xl border border-[#E6E6E6] p-4">
          <h3 className="font-black">Источники заказов</h3>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(["online", "cashier", "delivery"] as const).map((source) => (
              <Toggle
                key={source}
                active={settings[source]}
                label={source.toUpperCase()}
                onClick={() =>
                  setSettings({ ...settings, [source]: !settings[source] })
                }
              />
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-[#E6E6E6] p-4 lg:col-span-2">
          <h3 className="font-black">Размер карточек заказа</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["compact", "standard", "large"] as const).map((size) => (
              <button
                type="button"
                className={`rounded-2xl px-4 py-3 font-bold ${
                  settings.cardSize === size
                    ? "bg-[#E30613] text-white"
                    : "bg-[#F7F7F7] text-[#777777]"
                }`}
                key={size}
                onClick={() => setSettings({ ...settings, cardSize: size })}
              >
                {size === "compact"
                  ? "Компактные"
                  : size === "standard"
                    ? "Стандартные"
                    : "Крупные"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function QrSection() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {[
        ["QR для самовывоза", "Гость открывает меню и выбирает выдачу у стойки."],
        ["QR для столиков", "Будущий сценарий заказа с привязкой к столику."],
        ["QR для доставки", "Будущий сценарий внешней доставки."],
      ].map(([title, description]) => (
        <Card key={title}>
          <div className="flex aspect-square items-center justify-center rounded-3xl bg-[#F7F7F7] text-5xl font-black text-[#E30613]">
            QR
          </div>
          <h2 className="mt-5 text-xl font-black">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#777777]">{description}</p>
          <SecondaryButton disabled onClick={() => undefined}>Скоро</SecondaryButton>
        </Card>
      ))}
    </div>
  );
}

function SettingsSection({
  settings,
  setSettings,
}: {
  settings: GeneralSettings;
  setSettings: (settings: GeneralSettings) => void;
}) {
  return (
    <Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <TextField
          label="Название кофейни"
          value={settings.coffeehouseName}
          onChange={(coffeehouseName) =>
            setSettings({ ...settings, coffeehouseName })
          }
        />
        <TextField
          label="Логотип"
          value={settings.logoLabel}
          onChange={(logoLabel) => setSettings({ ...settings, logoLabel })}
        />
        <TextField
          label="Цвет темы"
          value={settings.themeColor}
          onChange={(themeColor) => setSettings({ ...settings, themeColor })}
        />
        <TextField
          label="Контакты"
          value={settings.contacts}
          onChange={(contacts) => setSettings({ ...settings, contacts })}
        />
        <TextArea
          label="Баннеры"
          value={settings.banners}
          onChange={(banners) => setSettings({ ...settings, banners })}
        />
      </div>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-[32px] border border-[#E6E6E6] bg-white p-5 shadow-[0_18px_44px_rgba(26,26,26,0.05)]">
      {children}
    </section>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[28px] border border-[#E6E6E6] bg-white p-5 text-sm font-bold leading-6 text-[#777777]">
      {children}
    </div>
  );
}

function TextField({
  disabled = false,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#777777]">{label}</span>
      <input
        className="mt-2 h-12 w-full rounded-2xl border border-[#E6E6E6] bg-[#F7F7F7] px-4 font-semibold outline-none transition focus:border-[#E30613] disabled:text-[#A1A1AA]"
        disabled={disabled}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-[#777777]">{label}</span>
      <textarea
        className="mt-2 min-h-28 w-full resize-none rounded-2xl border border-[#E6E6E6] bg-[#F7F7F7] px-4 py-3 font-semibold outline-none transition focus:border-[#E30613]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`min-h-12 rounded-2xl px-3 text-sm font-black ${
        active ? "bg-[#E30613] text-white" : "bg-[#EFEFEF] text-[#777777]"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function SettingsToggle({
  active,
  description,
  onClick,
  title,
}: {
  active: boolean;
  description: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className="rounded-3xl border border-[#E6E6E6] p-4 text-left transition hover:bg-[#F7F7F7]"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-black">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-[#777777]">{description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-sm font-black ${
            active ? "bg-[#E30613] text-white" : "bg-[#EFEFEF] text-[#777777]"
          }`}
        >
          {active ? "Вкл" : "Выкл"}
        </span>
      </div>
    </button>
  );
}

function PrimaryButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="min-h-12 rounded-2xl bg-[#E30613] px-5 font-black text-white shadow-[0_14px_28px_rgba(227,6,19,0.18)] transition hover:bg-[#C80010] disabled:cursor-not-allowed disabled:bg-[#EFEFEF] disabled:text-[#777777] disabled:shadow-none"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="mt-4 min-h-12 rounded-2xl border border-[#E6E6E6] bg-white px-5 font-black text-[#1A1A1A] transition hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:text-[#A1A1AA]"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <div className="rounded-full bg-white px-4 py-2 text-sm font-black shadow-[0_12px_26px_rgba(26,26,26,0.05)]">
      {connected ? "🟢 iiko подключена" : "⚪ Локальные данные"}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#777777]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function createDefaultOverlay(item: MenuItem): StorefrontOverlay {
  return {
    displayName: item.name,
    description: item.description,
    imageSrc: item.imageSrc,
    visible: item.isActive,
    badgeHit: false,
    badgeNew: false,
    sortOrder: item.sortOrder,
  };
}

function getStoredOverlays() {
  if (typeof window === "undefined") return {};

  const savedOverlay = localStorage.getItem(overlayStorageKey);

  if (!savedOverlay) return {};

  try {
    return JSON.parse(savedOverlay) as StorefrontOverlayState;
  } catch {
    return {};
  }
}

function getIikoProductId(item: MenuItem) {
  return item.id.startsWith("iiko-") ? item.id : `mock-iiko-product-${item.id}`;
}

function getIikoCategoryId(item: MenuItem) {
  return item.categoryId.startsWith("iiko-")
    ? item.categoryId
    : `mock-iiko-category-${item.categoryId}`;
}

function getPageTitle(section: AdminSection) {
  if (section === "connections") return "Интеграции";
  if (section === "storefront") return "Редактор витрины";
  if (section === "barista") return "Настройки бариста";
  if (section === "qr") return "QR-витрина";
  return "Общие настройки";
}

function getPageDescription(section: AdminSection) {
  if (section === "connections") {
    return "iiko Cloud API, iiko Webhook, ЮKassa и платформа Tablo в одном месте.";
  }
  if (section === "storefront") {
    return "Настройка красивого слоя поверх товаров, синхронизированных из iiko. Цены, категории и модификаторы не редактируются вручную.";
  }
  if (section === "barista") {
    return "Настройки рабочего места бариста без вмешательства в меню и учетные данные.";
  }
  if (section === "qr") {
    return "Подготовка QR-точек входа для разных сценариев заказа.";
  }
  return "Брендовые настройки кофейни, которые не являются учетными данными iiko.";
}
