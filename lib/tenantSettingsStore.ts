import {
  readStorefrontJson,
  StorefrontPersistenceError,
  writeStorefrontJson,
} from "@/lib/storefrontStorage";

export type TenantSettingsDocument = {
  version: 1;
  qrTargetUrl: string | null;
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

function getTenantSettingsStorage() {
  const tenantId = getTenantId();

  return {
    redisKey: `tablo:tenant:${tenantId}:settings:v1`,
    localFileName: `tenant-settings-${tenantId.replace(/[^a-zA-Z0-9_-]/g, "-")}.json`,
  };
}

function getTenantId() {
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
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : null,
  };
}
