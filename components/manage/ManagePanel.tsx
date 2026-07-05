"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  createIikoSyncSummary,
  iikoReadOnlyRequests,
  type IikoConnectionResult,
  type IikoOrganization,
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
  lastOrderStatus: string | null;
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
  selectedOrganizationName: string | null;
  selectedTerminalGroupName: string | null;
  categoriesCount: number;
  productsCount: number;
  modifiersCount: number;
  menuReceived: boolean;
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
  orderStatus: string | null;
  rawBody: string | null;
  parsedJson: unknown | null;
  headers: Record<string, string | boolean | null>;
};

const navItems: Array<{ id: AdminSection; label: string; hint: string }> = [
  { id: "connections", label: "Подключения", hint: "iiko и платежи" },
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
  const [showEnvModeWarning, setShowEnvModeWarning] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
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

  const selectedOrganization = useMemo(() => {
    if (!iikoResult) return null;
    return (
      iikoResult.organizations.find(
        (organization) => organization.id === selectedOrganizationId,
      ) ?? iikoResult.organization
    );
  }, [iikoResult, selectedOrganizationId]);

  const syncSummary = useMemo(() => createIikoSyncSummary(menu), [menu]);

  useEffect(() => {
    void refreshWebhookStatus();
  }, []);

  async function refreshWebhookStatus() {
    try {
      const response = await fetch("/api/iiko/webhook-monitor", { cache: "no-store" });
      setWebhookStatus((await response.json()) as IikoWebhookStatus);
    } catch {
      setWebhookStatus({
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
        lastOrderStatus: null,
        lastHttpStatus: null,
        lastClientIp: null,
        lastUserAgent: null,
        lastError: "Не удалось получить статус событий iiko",
        lastPayload: null,
        lastMessage: null,
        requests: [],
      });
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
        lastOrderStatus: current?.lastOrderStatus ?? null,
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
      setSelectedOrganizationId(
        result.organizations.length === 1 ? result.organization.id : "",
      );
      setLastSyncAt(result.lastSyncAt);
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

  function syncMenuAgain() {
    const nextSyncAt = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
    }).format(new Date());
    setLastSyncAt(nextSyncAt);
    setIikoResult((current) =>
      current
        ? {
            ...current,
            lastSyncAt: nextSyncAt,
            summary:
              current.mode === "mock" ? createIikoSyncSummary(menu) : current.summary,
          }
        : current,
    );
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
              lastSyncAt={lastSyncAt}
              selectedOrganization={selectedOrganization}
              selectedOrganizationId={selectedOrganizationId}
              showEnvModeWarning={showEnvModeWarning}
              syncSummary={syncSummary}
              setSelectedOrganizationId={setSelectedOrganizationId}
              webhookStatus={webhookStatus}
              onCheckIiko={checkIikoConnection}
              onClearWebhook={clearWebhookJournal}
              onRefreshWebhook={refreshWebhookStatus}
              onSyncMenu={syncMenuAgain}
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
  lastSyncAt,
  selectedOrganization,
  selectedOrganizationId,
  showEnvModeWarning,
  syncSummary,
  webhookStatus,
  setSelectedOrganizationId,
  onCheckIiko,
  onClearWebhook,
  onRefreshWebhook,
  onSyncMenu,
}: {
  iikoError: string;
  iikoDiagnostics: IikoCheckDiagnostics | null;
  iikoResult: IikoConnectionResult | null;
  isCheckingIiko: boolean;
  lastSyncAt: string;
  selectedOrganization: IikoOrganization | null;
  selectedOrganizationId: string;
  showEnvModeWarning: boolean;
  syncSummary: { products: number; categories: number; modifiers: number; terminalGroups: number; stopLists: number };
  webhookStatus: IikoWebhookStatus | null;
  setSelectedOrganizationId: (value: string) => void;
  onCheckIiko: () => void;
  onClearWebhook: () => void;
  onRefreshWebhook: () => void;
  onSyncMenu: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">iiko</h2>
            <p className="mt-1 text-sm leading-6 text-[#777777]">
              Проверка подключения к меню, ценам, категориям, модификаторам,
              стоп-листам и наличию.
            </p>
          </div>
          <ConnectionBadge connected={Boolean(iikoResult)} />
        </div>

        {!iikoResult ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-[#F7F7F7] p-4">
              <p className="text-sm font-bold text-[#777777]">Безопасное подключение</p>
              <p className="mt-2 text-base font-black">
                Сейчас реальные ключи iiko задаются на сервере.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#777777]">
                Проверка использует iiko Cloud API v2: API Key ресторана, App ID
                приложения и Client Secret из переменных окружения. Форма ниже
                оставлена как будущий мастер подключения.
              </p>
            </div>
            <TextField
              disabled
              label="API Key"
              value="Задается в IIKO_API_KEY"
              onChange={() => undefined}
            />
            <TextField
              disabled
              label="App ID"
              value="Задается в IIKO_APP_ID"
              onChange={() => undefined}
            />
            <TextField
              disabled
              label="Client Secret"
              value="********"
              onChange={() => undefined}
              type="password"
            />
            {showEnvModeWarning ? (
              <p className="rounded-2xl bg-[#FFF4D7] px-4 py-3 text-sm font-bold text-[#8A6500]">
                Ключи и токены подключаются через серверные переменные
                окружения. На Vercel они задаются в Settings → Environment
                Variables. Безопасное хранение ключей в админке будет добавлено
                позже.
              </p>
            ) : null}
            {iikoError ? (
              <p className="rounded-2xl bg-[#E30613]/10 px-4 py-3 text-sm font-bold text-[#E30613]">
                {iikoError}
              </p>
            ) : null}
            <IikoDiagnosticsSummary diagnostics={iikoDiagnostics} />
            <PrimaryButton disabled={isCheckingIiko} onClick={onCheckIiko}>
              {isCheckingIiko ? "Проверяем..." : "Проверить подключение"}
            </PrimaryButton>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-3xl bg-[#F7F7F7] p-4">
              <p className="text-sm font-bold text-[#777777]">Секреты iiko</p>
              <p className="mt-1 text-lg font-black">
                Хранятся в серверных переменных окружения
              </p>
            </div>

            {iikoResult.organizations.length > 1 ? (
              <label className="block">
                <span className="text-sm font-bold text-[#777777]">
                  Организация
                </span>
                <select
                  className="mt-2 h-12 w-full rounded-2xl border border-[#E6E6E6] bg-white px-4 font-bold outline-none"
                  value={selectedOrganizationId}
                  onChange={(event) => setSelectedOrganizationId(event.target.value)}
                >
                  <option value="">Выберите организацию</option>
                  {iikoResult.organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <ConnectedSummary
              result={iikoResult}
              diagnostics={iikoDiagnostics}
              selectedOrganization={selectedOrganization}
              lastSyncAt={lastSyncAt}
            />

            <div className="flex flex-wrap gap-3">
              <PrimaryButton onClick={onSyncMenu}>Синхронизировать меню</PrimaryButton>
              <SecondaryButton onClick={onCheckIiko}>Проверить снова</SecondaryButton>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">ЮKassa</h2>
            <p className="mt-1 text-sm leading-6 text-[#777777]">
              Подготовка к paid-first flow. Реальная интеграция платежей на этом
              этапе не выполняется.
            </p>
          </div>
          <span className="rounded-full bg-[#EFEFEF] px-3 py-1.5 text-sm font-bold text-[#777777]">
            Не подключено
          </span>
        </div>

        <div className="mt-6 space-y-4">
          <TextField label="Shop ID" value="" onChange={() => undefined} placeholder="Будет заполнено позже" disabled />
          <TextField label="Secret Key" value="" onChange={() => undefined} placeholder="********" disabled type="password" />
          <SecondaryButton disabled onClick={() => undefined}>
            Подключить позже
          </SecondaryButton>
        </div>
      </Card>

      <WebhookCard
        status={webhookStatus}
        onClear={onClearWebhook}
        onRefresh={onRefreshWebhook}
      />

      <DeveloperDiagnostics summary={syncSummary} />
    </div>
  );
}

function WebhookCard({
  onClear,
  onRefresh,
  status,
}: {
  onClear: () => void;
  onRefresh: () => void;
  status: IikoWebhookStatus | null;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<IikoWebhookRequestLog | null>(null);
  const webhookUrl =
    status?.webhookUrl ?? "https://kafema-kurort.vercel.app/api/iiko/webhook";
  const curlExample = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Iiko-Webhook-Token: <token>" \\
  -d '{"eventType":"OrderUpdated","orderId":"demo-order","status":"NEW"}'`;
  const totalRequests = status?.totalRequests ?? 0;
  const successfulEvents = status?.totalReceived ?? 0;
  const totalErrors = status?.totalErrors ?? 0;
  const hasRequests = totalRequests > 0;
  const hasMessages = successfulEvents > 0;
  const payloadForViewer = status?.lastPayload ?? status?.lastMessage ?? null;
  const requestJournal = status?.requests ?? [];

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Монитор iiko</h2>
          <p className="mt-1 text-sm leading-6 text-[#777777]">
            Диагностика входящих событий от iiko.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-700">
          🟢 Готов
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-3xl bg-[#F7F7F7] p-4">
          <p className="text-sm font-bold text-[#777777]">Статус подключения</p>
          <p className="mt-2 text-xl font-black text-emerald-700">
            🟢 {formatIikoEventStatus(status?.message)}
          </p>
          {hasMessages ? (
            <p className="mt-2 text-sm font-bold text-[#777777]">
              Webhook принимает события. Последнее успешное событие:{" "}
              <span className="text-[#1A1A1A]">
                {formatWebhookDate(status?.lastWebhookReceivedAt)}
              </span>
            </p>
          ) : hasRequests ? (
            <div className="mt-4 rounded-[28px] border border-[#F4D6D8] bg-[#E30613]/5 p-5">
              <p className="text-lg font-black text-[#E30613]">
                Webhook вызывается, но успешных событий пока нет
              </p>
              <p className="mt-2 text-sm leading-6 text-[#777777]">
                iiko или клиент обращается к webhook, но запросы не проходят
                проверку. Смотрите журнал ошибок ниже.
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-[28px] border border-dashed border-[#DADADA] bg-white p-5">
              <p className="text-lg font-black">
                Webhook еще ни разу не вызывался
              </p>
              <p className="mt-2 text-sm leading-6 text-[#777777]">
                Как только на URL придет любой GET, POST, запрос без токена или
                запрос с ошибкой, он появится в журнале.
              </p>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Info
            label="Защитный токен"
            value={status?.tokenConfigured ? "Настроен" : "Не настроен"}
          />
          <Info label="Всего обращений к webhook" value={String(totalRequests)} />
          <Info label="Успешно принятых событий" value={String(successfulEvents)} />
          <Info label="Ошибочных обращений" value={String(totalErrors)} />
          <Info
            label="Последнее обращение"
            value={formatWebhookDate(requestJournal[0]?.receivedAt)}
          />
          <Info label="Последний HTTP Status" value={status?.lastHttpStatus ?? "Нет"} />
          <Info label="Последний IP" value={status?.lastClientIp ?? "Нет"} />
          <Info label="Последний User-Agent" value={status?.lastUserAgent ?? "Нет"} />
          <Info label="Последняя ошибка" value={status?.lastError ?? "Нет"} />
          <Info label="Последний тип события" value={status?.lastEventType ?? "Unknown"} />
          <Info label="Последний orderId" value={status?.lastOrderId ?? "Нет"} />
          <Info label="Статус заказа" value={status?.lastOrderStatus ?? "Нет"} />
        </div>

        <div className="rounded-3xl border border-[#E6E6E6] bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-black">Последние обращения</h3>
              <p className="mt-1 text-sm font-semibold text-[#777777]">
                Последние 20 запросов к /api/iiko/webhook.
              </p>
            </div>
            <span className="rounded-full bg-[#F7F7F7] px-3 py-1.5 text-sm font-black text-[#777777]">
              {requestJournal.length}
            </span>
          </div>

          {requestJournal.length > 0 ? (
            <div className="mt-4 divide-y divide-[#EFEFEF] overflow-hidden rounded-[24px] border border-[#EFEFEF]">
              {requestJournal.map((requestLog) => (
                <button
                  key={requestLog.id}
                  type="button"
                  className="grid w-full grid-cols-[132px_72px_92px_96px_minmax(120px,1fr)_minmax(120px,1fr)] items-center gap-3 bg-white px-4 py-3 text-left text-sm font-bold transition hover:bg-[#F7F7F7]"
                  onClick={() => setSelectedRequest(requestLog)}
                >
                  <span className="text-[#777777]">
                    {formatWebhookDate(requestLog.receivedAt)}
                  </span>
                  <span>{requestLog.method}</span>
                  <span
                    className={
                      requestLog.httpStatus >= 400
                        ? "text-[#E30613]"
                        : "text-emerald-700"
                    }
                  >
                    {requestLog.httpStatus}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-center text-xs ${
                      requestLog.success
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-[#E30613]/10 text-[#E30613]"
                    }`}
                  >
                    {requestLog.success ? "success" : "error"}
                  </span>
                  <span className="truncate">
                    {requestLog.eventType ?? requestLog.error ?? "Unknown"}
                  </span>
                  <span className="truncate text-[#777777]">
                    {requestLog.orderId ?? requestLog.clientIp ?? "Без orderId"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[24px] border border-dashed border-[#DADADA] bg-[#F7F7F7] p-5 text-sm font-bold text-[#777777]">
              Журнал пуст. Webhook еще ни разу не вызывался.
            </div>
          )}
        </div>

        <details className="rounded-3xl border border-[#E6E6E6] bg-[#F7F7F7] p-4">
          <summary className="cursor-pointer text-sm font-black text-[#777777]">
            Диагностика
          </summary>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-bold text-[#777777]">Webhook URL</p>
              <p className="mt-2 break-all font-mono text-sm font-black">
                {webhookUrl}
              </p>
            </div>
            <Info label="Warning" value={status?.warning ?? "Нет"} />
            <div>
              <p className="text-sm font-bold text-[#777777]">Пример curl</p>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs font-bold leading-6 text-[#1A1A1A]">
                {curlExample}
              </pre>
            </div>
          </div>
        </details>

        <div className="flex flex-wrap gap-3">
          <PrimaryButton onClick={onRefresh}>Обновить статус</PrimaryButton>
          {hasRequests ? (
            <>
              <SecondaryButton
                disabled={!payloadForViewer}
                onClick={() => setShowPayload(true)}
              >
                Показать последнее сообщение
              </SecondaryButton>
              <SecondaryButton onClick={onClear}>Очистить журнал</SecondaryButton>
            </>
          ) : null}
        </div>
      </div>

      {showPayload ? (
        <JsonViewerModal
          payload={payloadForViewer}
          onClose={() => setShowPayload(false)}
        />
      ) : null}
      {selectedRequest ? (
        <JsonViewerModal
          payload={{
            error: selectedRequest.error,
            headers: selectedRequest.headers,
            parsedJson: selectedRequest.parsedJson,
            rawBody: selectedRequest.rawBody,
            request: {
              clientIp: selectedRequest.clientIp,
              contentType: selectedRequest.contentType,
              eventType: selectedRequest.eventType,
              hasAuthorization: selectedRequest.hasAuthorization,
              hasHeaderToken: selectedRequest.hasHeaderToken,
              hasQueryToken: selectedRequest.hasQueryToken,
              httpStatus: selectedRequest.httpStatus,
              httpStatusText: selectedRequest.httpStatusText,
              method: selectedRequest.method,
              orderId: selectedRequest.orderId,
              path: selectedRequest.path,
              receivedAt: selectedRequest.receivedAt,
              success: selectedRequest.success,
              userAgent: selectedRequest.userAgent,
            },
          }}
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
    </Card>
  );
}

function ConnectedSummary({
  diagnostics,
  result,
  selectedOrganization,
  lastSyncAt,
}: {
  diagnostics: IikoCheckDiagnostics | null;
  result: IikoConnectionResult;
  selectedOrganization: IikoOrganization | null;
  lastSyncAt: string;
}) {
  const organization = selectedOrganization ?? result.organization;
  const metrics = diagnostics
    ? {
        categories: diagnostics.categoriesCount,
        modifiers: diagnostics.modifiersCount,
        products: diagnostics.productsCount,
      }
    : result.summary;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-[#F7F7F7] p-4">
        <p className="text-lg font-black text-emerald-600">🟢 Подключено</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Info label="Организация" value={organization.name} />
          <Info label="authVersion" value={diagnostics?.authVersion ?? result.authVersion ?? "v2"} />
          <Info
            label="tokenReceived"
            value={(diagnostics?.tokenReceived ?? result.tokenReceived) ? "true" : "false"}
          />
          <Info label="Версия iiko" value={result.version} />
          <Info
            label="Авторизация"
            value={result.authVersion === "v2" ? "iiko Cloud API v2" : "Legacy"}
          />
          <Info label="organizationId" value={organization.id} />
          <Info
            label="terminalGroupId"
            value={organization.terminalGroupId ?? "Не получен"}
          />
        </div>
      </div>

      <IikoDiagnosticsSummary diagnostics={diagnostics} />

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="товаров" value={metrics.products} />
        <Metric label="категорий" value={metrics.categories} />
        <Metric label="модификаторов" value={metrics.modifiers} />
        <Metric label="terminal groups" value={result.summary.terminalGroups} />
        <Metric label="стоп-листов" value={result.summary.stopLists} />
      </div>

      <div className="rounded-3xl border border-[#E6E6E6] p-4">
        <h3 className="font-black">Диагностика iiko</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Info label="Статус подключения" value="Подключено" />
          <Info label="Режим" value={result.mode === "real" ? "iiko" : "Локальные данные"} />
          <Info label="Token получен" value={result.tokenReceived ? "Да" : "Нет"} />
          <Info label="Меню получено" value={result.menuReceived ? "Да" : "Нет"} />
          <Info label="Последняя успешная синхронизация" value={lastSyncAt} />
          <Info label="Последняя ошибка" value={result.lastError ?? "Нет"} />
          <Info label="Секреты" value="Не отображаются" />
        </div>
      </div>
    </div>
  );
}

function IikoDiagnosticsSummary({
  diagnostics,
}: {
  diagnostics: IikoCheckDiagnostics | null;
}) {
  if (!diagnostics) return null;

  const productsMissing =
    diagnostics.tokenReceived &&
    Boolean(diagnostics.selectedOrganizationName) &&
    Boolean(diagnostics.selectedTerminalGroupName) &&
    diagnostics.productsCount === 0;

  return (
    <div className="rounded-3xl border border-[#E6E6E6] bg-white p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Info label="authVersion" value={diagnostics.authVersion} />
        <Info label="tokenReceived" value={diagnostics.tokenReceived ? "true" : "false"} />
        <Info
          label="organizationName"
          value={diagnostics.selectedOrganizationName ?? "Не получена"}
        />
        <Info
          label="terminalGroupName"
          value={diagnostics.selectedTerminalGroupName ?? "Не получена"}
        />
        <Info label="categoriesCount" value={String(diagnostics.categoriesCount)} />
        <Info label="productsCount" value={String(diagnostics.productsCount)} />
        <Info label="modifiersCount" value={String(diagnostics.modifiersCount)} />
      </div>

      {productsMissing ? (
        <p className="mt-4 whitespace-pre-line rounded-2xl bg-[#FFF4D7] px-4 py-3 text-sm font-bold leading-6 text-[#8A6500]">
          {`Авторизация успешна.
Организация найдена.
Терминальная группа найдена.
iiko не возвращает товары.
Категорий: ${diagnostics.categoriesCount}.
Товаров: 0.`}
        </p>
      ) : null}

      {diagnostics.cache?.warning ? (
        <p className="mt-3 rounded-2xl bg-[#FFF4D7] px-4 py-3 text-sm font-bold text-[#8A6500]">
          {diagnostics.cache.warning}
        </p>
      ) : null}
    </div>
  );
}

function JsonViewerModal({
  onClose,
  payload,
}: {
  onClose: () => void;
  payload: unknown;
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
            <h3 className="text-2xl font-black">Последнее сообщение iiko</h3>
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

function formatIikoEventStatus(message?: string) {
  if (!message) {
    return "Загружается";
  }

  if (message.toLowerCase().includes("webhook")) {
    return "Готов к приему событий";
  }

  return message;
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

function DeveloperDiagnostics({ summary }: { summary: { products: number; categories: number; modifiers: number; terminalGroups: number; stopLists: number } }) {
  return (
    <details className="xl:col-span-2 rounded-[28px] border border-[#E6E6E6] bg-white p-5">
      <summary className="cursor-pointer text-lg font-black">
        Для разработчика
      </summary>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">Расширенная диагностика iiko</h2>
          <p className="mt-1 text-sm text-[#777777]">
            Служебная информация для проверки интеграции и разрешенных запросов.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-700">
          write-операций нет
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#EFEFEF]">
        {iikoReadOnlyRequests.map((request) => (
          <div
            className="grid gap-3 border-b border-[#EFEFEF] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[90px_220px_110px_1fr]"
            key={request.endpoint}
          >
            <span className="font-black">{request.method}</span>
            <span className="font-mono text-xs">{request.endpoint}</span>
            <span className="font-bold text-emerald-700">{request.mode}</span>
            <span className="text-[#777777]">{request.purpose}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs font-bold text-[#777777]">
        Локальная сводка: {summary.products} товаров, {summary.categories}{" "}
        категорий, {summary.modifiers} модификаторов, {summary.terminalGroups}{" "}
        terminal groups, {summary.stopLists} стоп-листов.
      </p>
    </details>
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

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1.5 text-sm font-black ${
        connected ? "bg-emerald-50 text-emerald-700" : "bg-[#EFEFEF] text-[#777777]"
      }`}
    >
      {connected ? "Подключено" : "Не подключено"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl bg-[#F7F7F7] p-4">
      <p className="text-3xl font-black">{value}</p>
      <p className="mt-1 text-sm font-bold text-[#777777]">{label}</p>
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
  if (section === "connections") return "Центр подключений";
  if (section === "storefront") return "Редактор витрины";
  if (section === "barista") return "Настройки бариста";
  if (section === "qr") return "QR-витрина";
  return "Общие настройки";
}

function getPageDescription(section: AdminSection) {
  if (section === "connections") {
    return "Главный экран Manager. Здесь подключаются iiko и платежи, без ручного дублирования учетной системы.";
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
