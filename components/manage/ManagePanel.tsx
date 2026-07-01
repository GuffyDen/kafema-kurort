"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  createIikoSyncSummary,
  iikoReadOnlyRequests,
  type IikoConnectionResult,
  type IikoOrganization,
} from "@/lib/iikoReadOnlyProvider";
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

type BaristaSettings = {
  showSource: boolean;
  online: boolean;
  cashier: boolean;
  delivery: boolean;
  sound: boolean;
  autoScroll: boolean;
  cardSize: "compact" | "standard" | "large";
};

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
  lastWebhookReceivedAt: string | null;
  lastEventType: string | null;
  lastOrderId: string | null;
  lastOrderStatus: string | null;
  lastError: string | null;
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
  const [iikoError, setIikoError] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<IikoWebhookStatus | null>(null);
  const [showEnvModeWarning, setShowEnvModeWarning] = useState(false);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [overlays, setOverlays] = useState<StorefrontOverlayState>(() =>
    getStoredOverlays(),
  );
  const [baristaSettings, setBaristaSettings] = useState<BaristaSettings>({
    showSource: true,
    online: true,
    cashier: true,
    delivery: false,
    sound: true,
    autoScroll: true,
    cardSize: "standard",
  });
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
      const response = await fetch("/api/iiko/webhook", { cache: "no-store" });
      setWebhookStatus((await response.json()) as IikoWebhookStatus);
    } catch {
      setWebhookStatus({
        status: "error",
        message: "Не удалось получить статус webhook",
        webhookUrl: "https://kafema-kurort.vercel.app/api/iiko/webhook",
        tokenConfigured: false,
        warning: null,
        lastWebhookReceivedAt: null,
        lastEventType: null,
        lastOrderId: null,
        lastOrderStatus: null,
        lastError: "Не удалось получить статус webhook",
      });
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
        | { ok: true; result: IikoConnectionResult }
        | { ok: false; error: string };

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
          ? `${error.message}. Приложение осталось в mock/local mode.`
          : "Не удалось проверить iiko. Приложение осталось в mock/local mode.",
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

  return (
    <main className="min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
      <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-[280px_1fr]">
        <aside className="border-r border-[#E6E6E6] bg-white px-5 py-6">
          <div>
            <p className="text-2xl font-black tracking-tight">Кафема Курорт</p>
            <p className="mt-1 text-sm text-[#777777]">Manager / Admin</p>
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
              iikoResult={iikoResult}
              isCheckingIiko={isCheckingIiko}
              lastSyncAt={lastSyncAt}
              selectedOrganization={selectedOrganization}
              selectedOrganizationId={selectedOrganizationId}
              showEnvModeWarning={showEnvModeWarning}
              setSelectedOrganizationId={setSelectedOrganizationId}
              webhookStatus={webhookStatus}
              onCheckIiko={checkIikoConnection}
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

          <ReadOnlyAudit summary={syncSummary} />
        </section>
      </div>
    </main>
  );
}

function ConnectionsSection({
  iikoError,
  iikoResult,
  isCheckingIiko,
  lastSyncAt,
  selectedOrganization,
  selectedOrganizationId,
  showEnvModeWarning,
  webhookStatus,
  setSelectedOrganizationId,
  onCheckIiko,
  onRefreshWebhook,
  onSyncMenu,
}: {
  iikoError: string;
  iikoResult: IikoConnectionResult | null;
  isCheckingIiko: boolean;
  lastSyncAt: string;
  selectedOrganization: IikoOrganization | null;
  selectedOrganizationId: string;
  showEnvModeWarning: boolean;
  webhookStatus: IikoWebhookStatus | null;
  setSelectedOrganizationId: (value: string) => void;
  onCheckIiko: () => void;
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
              Read-only подключение. iiko остается source of truth для меню,
              цен, категорий, модификаторов, стоп-листов и наличия.
            </p>
          </div>
          <ConnectionBadge connected={Boolean(iikoResult)} />
        </div>

        {!iikoResult ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-[#F7F7F7] p-4">
              <p className="text-sm font-bold text-[#777777]">Server env mode</p>
              <p className="mt-2 text-base font-black">
                Сейчас реальные ключи iiko берутся только из `.env.local`.
              </p>
              <p className="mt-2 text-sm leading-6 text-[#777777]">
                Форма ниже оставлена как будущий мастер подключения. Безопасное
                хранение ключей в админке будет добавлено позже.
              </p>
            </div>
            <TextField
              disabled
              label="API Login"
              value="Задается в IIKO_API_LOGIN"
              onChange={() => undefined}
            />
            <TextField
              disabled
              label="API Key"
              value="********"
              onChange={() => undefined}
              type="password"
            />
            {showEnvModeWarning ? (
              <p className="rounded-2xl bg-[#FFF4D7] px-4 py-3 text-sm font-bold text-[#8A6500]">
                В MVP ключи подключаются через серверный .env.local. Безопасное
                хранение ключей в админке будет добавлено позже.
              </p>
            ) : null}
            {iikoError ? (
              <p className="rounded-2xl bg-[#E30613]/10 px-4 py-3 text-sm font-bold text-[#E30613]">
                {iikoError}
              </p>
            ) : null}
            <PrimaryButton disabled={isCheckingIiko} onClick={onCheckIiko}>
              {isCheckingIiko ? "Проверяем..." : "Проверить подключение"}
            </PrimaryButton>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="rounded-3xl bg-[#F7F7F7] p-4">
              <p className="text-sm font-bold text-[#777777]">API Key</p>
              <p className="mt-1 text-lg font-black">********</p>
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
        onRefresh={onRefreshWebhook}
      />
    </div>
  );
}

function WebhookCard({
  onRefresh,
  status,
}: {
  onRefresh: () => void;
  status: IikoWebhookStatus | null;
}) {
  const webhookUrl =
    status?.webhookUrl ?? "https://kafema-kurort.vercel.app/api/iiko/webhook";
  const curlExample = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Iiko-Webhook-Token: <token>" \\
  -d '{"eventType":"OrderUpdated","orderId":"demo-order","status":"NEW"}'`;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Webhook</h2>
          <p className="mt-1 text-sm leading-6 text-[#777777]">
            Входящий endpoint для событий iiko. События принимаются локально и
            сохраняются в mock-хранилище для будущей BaristaQueue.
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-black text-emerald-700">
          ready
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-3xl bg-[#F7F7F7] p-4">
          <p className="text-sm font-bold text-[#777777]">Webhook URL</p>
          <p className="mt-2 break-all font-mono text-sm font-black">
            {webhookUrl}
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Info label="Статус" value={status?.message ?? "Загружается"} />
          <Info
            label="Token"
            value={status?.tokenConfigured ? "configured" : "not configured"}
          />
          <Info
            label="Last webhook"
            value={status?.lastWebhookReceivedAt ?? "Еще не получен"}
          />
          <Info label="Last event type" value={status?.lastEventType ?? "Нет"} />
          <Info label="Last orderId" value={status?.lastOrderId ?? "Нет"} />
          <Info label="Last status" value={status?.lastOrderStatus ?? "Нет"} />
          <Info label="Last error" value={status?.lastError ?? "Нет"} />
          <Info label="Warning" value={status?.warning ?? "Нет"} />
        </div>

        <div className="rounded-3xl border border-[#E6E6E6] bg-[#F7F7F7] p-4">
          <p className="text-sm font-bold text-[#777777]">Пример curl</p>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs font-bold leading-6 text-[#1A1A1A]">
            {curlExample}
          </pre>
        </div>

        <SecondaryButton onClick={onRefresh}>Обновить статус webhook</SecondaryButton>
      </div>
    </Card>
  );
}

function ConnectedSummary({
  result,
  selectedOrganization,
  lastSyncAt,
}: {
  result: IikoConnectionResult;
  selectedOrganization: IikoOrganization | null;
  lastSyncAt: string;
}) {
  const organization = selectedOrganization ?? result.organization;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-[#F7F7F7] p-4">
        <p className="text-lg font-black text-emerald-600">🟢 Подключено</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Info label="Организация" value={organization.name} />
          <Info label="Версия iiko" value={result.version} />
          <Info label="organizationId" value={organization.id} />
          <Info
            label="terminalGroupId"
            value={organization.terminalGroupId ?? "Не получен"}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="товаров" value={result.summary.products} />
        <Metric label="категорий" value={result.summary.categories} />
        <Metric label="модификаторов" value={result.summary.modifiers} />
        <Metric label="terminal groups" value={result.summary.terminalGroups} />
        <Metric label="стоп-листов" value={result.summary.stopLists} />
      </div>

      <div className="rounded-3xl border border-[#E6E6E6] p-4">
        <h3 className="font-black">Диагностика iiko</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Info label="Статус подключения" value="Подключено" />
          <Info label="Режим" value={result.mode === "real" ? "real iiko" : "mock/local"} />
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
                  <p className="mt-3 text-xs font-bold text-[#777777]">
                    iikoProductId
                  </p>
                  <p className="break-all text-sm font-black">{getIikoProductId(item)}</p>
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

                  <div className="lg:col-span-2 rounded-3xl bg-[#F7F7F7] p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <Info label="iikoCategoryId" value={getIikoCategoryId(item)} />
                      <Info label="Категория из iiko" value={category?.name ?? "Не найдена"} />
                      <Info
                        label="iikoModifierId"
                        value={modifierIds.length ? modifierIds.join(", ") : "Нет"}
                      />
                    </div>
                  </div>
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
          <SecondaryButton onClick={() => undefined}>Скачать PDF</SecondaryButton>
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

function ReadOnlyAudit({ summary }: { summary: { products: number; categories: number; modifiers: number; terminalGroups: number; stopLists: number } }) {
  return (
    <section className="mt-6 rounded-[28px] border border-[#E6E6E6] bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">iiko request audit</h2>
          <p className="mt-1 text-sm text-[#777777]">
            В текущем этапе разрешены только read-only операции.
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
        Mock/local summary: {summary.products} товаров, {summary.categories}{" "}
        категорий, {summary.modifiers} модификаторов, {summary.terminalGroups}{" "}
        terminal groups, {summary.stopLists} стоп-листов.
      </p>
    </section>
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
      {connected ? "🟢 iiko подключена" : "⚪ mock/local mode"}
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
