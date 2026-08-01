import {
  readStorefrontJson,
  StorefrontPersistenceError,
  writeStorefrontJson,
} from "@/lib/storefrontStorage";
import {
  createEmptyTableStandLibrary,
  defaultTableStandLayout,
  isTableStandMimeType,
  TABLE_STAND_CUSTOM_TEMPLATE_ID,
  type TableStandLayoutInput,
  type TableStandLibrary,
  type TableStandMimeType,
  type TableStandTemplate,
} from "@/lib/qr/tableStand";

export type TenantSettingsDocument = {
  version: 1;
  qrTargetUrl: string | null;
  tableStand: TableStandLibrary;
  updatedAt: string | null;
};

export { StorefrontPersistenceError };

export async function readTenantSettings() {
  const storage = getTenantSettingsStorage();
  const stored = await readStorefrontJson<Partial<TenantSettingsDocument>>(
    storage.redisKey,
    storage.localFileName,
  );

  return {
    document: normalizeTenantSettings(stored.value),
    persistence: stored.persistence,
  };
}

export async function saveQrTargetUrl(qrTargetUrl: string) {
  const { document } = await readTenantSettings();
  const storage = getTenantSettingsStorage();
  const next: TenantSettingsDocument = {
    ...document,
    qrTargetUrl,
    updatedAt: new Date().toISOString(),
  };

  const persistence = await writeStorefrontJson(
    storage.redisKey,
    storage.localFileName,
    next,
  );

  return { document: next, persistence };
}

export async function saveCustomTableStandTemplate(input: {
  templateUrl: string;
  templateWidth: number;
  templateHeight: number;
  templateMimeType: TableStandMimeType;
}) {
  const { document } = await readTenantSettings();
  const storage = getTenantSettingsStorage();
  const previousTemplate = document.tableStand.templates.find(
    (template) => template.id === TABLE_STAND_CUSTOM_TEMPLATE_ID,
  );
  const now = new Date().toISOString();
  const template: TableStandTemplate = {
    id: TABLE_STAND_CUSTOM_TEMPLATE_ID,
    kind: "custom",
    name: "Собственный шаблон",
    ...input,
    qrPositionX: previousTemplate?.qrPositionX ?? defaultTableStandLayout.qrPositionX,
    qrPositionY: previousTemplate?.qrPositionY ?? defaultTableStandLayout.qrPositionY,
    qrSize: previousTemplate?.qrSize ?? defaultTableStandLayout.qrSize,
    whiteBackground:
      previousTemplate?.whiteBackground ?? defaultTableStandLayout.whiteBackground,
    safePadding: previousTemplate?.safePadding ?? defaultTableStandLayout.safePadding,
    updatedAt: now,
  };
  const templates = document.tableStand.templates.filter(
    (item) => item.id !== TABLE_STAND_CUSTOM_TEMPLATE_ID,
  );
  const next: TenantSettingsDocument = {
    ...document,
    tableStand: {
      version: 1,
      activeTemplateId: template.id,
      templates: [...templates, template],
    },
    updatedAt: now,
  };

  const persistence = await writeStorefrontJson(
    storage.redisKey,
    storage.localFileName,
    next,
  );

  return { document: next, persistence, previousTemplate, template };
}

export async function saveTableStandLayout(
  templateId: string,
  layout: TableStandLayoutInput,
) {
  const { document } = await readTenantSettings();
  const storage = getTenantSettingsStorage();
  const now = new Date().toISOString();
  let updated = false;
  const templates = document.tableStand.templates.map((template) => {
    if (template.id !== templateId) return template;
    updated = true;
    return { ...template, ...layout, updatedAt: now };
  });

  if (!updated) {
    throw new StorefrontPersistenceError("Шаблон Table Stand не найден.");
  }

  const next: TenantSettingsDocument = {
    ...document,
    tableStand: {
      version: 1,
      activeTemplateId: templateId,
      templates,
    },
    updatedAt: now,
  };
  const persistence = await writeStorefrontJson(
    storage.redisKey,
    storage.localFileName,
    next,
  );

  return { document: next, persistence };
}

export function getTableStandBlobPathPrefix() {
  const tenantId = getTenantId().replace(/[^a-zA-Z0-9_-]/g, "-");
  return `tenants/${tenantId}/table-stand/template-`;
}

function getTenantSettingsStorage() {
  const tenantId = getTenantId();

  return {
    redisKey: `tablo:tenant:${tenantId}:settings:v1`,
    localFileName: `tenant-settings-${tenantId.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`,
  };
}

export function getTenantId() {
  const configuredTenantId = process.env.IIKO_TERMINAL_GROUP_ID?.trim();

  if (configuredTenantId) {
    return configuredTenantId;
  }

  if (process.env.NODE_ENV !== "production") {
    return "local";
  }

  throw new StorefrontPersistenceError(
    "Не настроен идентификатор заведения для сохранения QR.",
  );
}

function normalizeTenantSettings(
  value: Partial<TenantSettingsDocument> | null,
): TenantSettingsDocument {
  return {
    version: 1,
    qrTargetUrl:
      typeof value?.qrTargetUrl === "string" ? value.qrTargetUrl : null,
    tableStand: normalizeTableStandLibrary(value?.tableStand),
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}

function normalizeTableStandLibrary(value: unknown): TableStandLibrary {
  if (!isRecord(value) || !Array.isArray(value.templates)) {
    return createEmptyTableStandLibrary();
  }

  const templates = value.templates
    .map(normalizeTableStandTemplate)
    .filter((template): template is TableStandTemplate => template !== null);
  const activeTemplateId =
    typeof value.activeTemplateId === "string" &&
    templates.some((template) => template.id === value.activeTemplateId)
      ? value.activeTemplateId
      : templates[0]?.id ?? null;

  return { version: 1, activeTemplateId, templates };
}

function normalizeTableStandTemplate(value: unknown): TableStandTemplate | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.kind !== "custom" && value.kind !== "system") ||
    typeof value.name !== "string" ||
    typeof value.templateUrl !== "string" ||
    !isPositiveNumber(value.templateWidth) ||
    !isPositiveNumber(value.templateHeight) ||
    !isTableStandMimeType(value.templateMimeType) ||
    !isFiniteNumber(value.qrPositionX) ||
    !isFiniteNumber(value.qrPositionY) ||
    !isFiniteNumber(value.qrSize) ||
    typeof value.whiteBackground !== "boolean" ||
    !isFiniteNumber(value.safePadding) ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  return value as TableStandTemplate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}
