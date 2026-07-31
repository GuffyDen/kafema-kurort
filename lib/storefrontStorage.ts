import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorefrontPersistence } from "@/lib/storefrontTypes";

const localDirectory = path.join(process.cwd(), ".data");

export const storefrontRedisKeys = {
  menu: "tablo:kafema-sanatornaya:storefront-menu:v1",
  overrides: "tablo:kafema-sanatornaya:storefront-overrides:v1",
  stopList: "tablo:kafema-sanatornaya:stop-list:v1",
  stopListLock: "tablo:kafema-sanatornaya:stop-list-refresh-lock:v1",
} as const;

export class StorefrontPersistenceError extends Error {}

export function getStorefrontPersistence(): StorefrontPersistence {
  const { url, token } = getRedisCredentials();

  if (url && token) {
    return {
      mode: "redis",
      writable: true,
      warning: null,
    };
  }

  if (process.env.NODE_ENV !== "production") {
    return {
      mode: "local-file",
      writable: true,
      warning:
        "Локальный режим: данные витрины хранятся в .data. Для Vercel подключите Redis.",
    };
  }

  return {
    mode: "unconfigured",
    writable: false,
    warning:
      "Постоянное хранилище не подключено. Добавьте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN.",
  };
}

export async function readStorefrontJson<T>(
  key: string,
  localFileName: string,
): Promise<{
  value: T | null;
  persistence: StorefrontPersistence;
}> {
  const persistence = getStorefrontPersistence();
  let rawValue: string | null = null;

  if (persistence.mode === "redis") {
    const result = await executeRedisCommand(["GET", key]);
    rawValue = typeof result === "string" ? result : null;
  } else if (persistence.mode === "local-file") {
    rawValue = await readLocalValue(localFileName);
  }

  return {
    value: parseJson<T>(rawValue),
    persistence,
  };
}

export async function writeStorefrontJson(
  key: string,
  localFileName: string,
  value: unknown,
) {
  const persistence = getStorefrontPersistence();
  assertWritable(persistence);
  const serialized = JSON.stringify(value);

  if (persistence.mode === "redis") {
    await executeRedisCommand(["SET", key, serialized]);
  } else if (persistence.mode === "local-file") {
    await writeLocalValue(localFileName, serialized);
  }

  return persistence;
}

export async function tryAcquireStorefrontLock(
  key: string,
  owner: string,
  ttlMs: number,
) {
  const persistence = getStorefrontPersistence();

  if (persistence.mode !== "redis") {
    return { acquired: true, persistence };
  }

  const result = await executeRedisCommand([
    "SET",
    key,
    owner,
    "NX",
    "PX",
    String(ttlMs),
  ]);

  return {
    acquired: result === "OK",
    persistence,
  };
}

export async function releaseStorefrontLock(key: string) {
  if (getStorefrontPersistence().mode === "redis") {
    await executeRedisCommand(["DEL", key]);
  }
}

export async function executeRedisCommand(command: string[]) {
  const { url, token } = getRedisCredentials();

  if (!url || !token) {
    throw new StorefrontPersistenceError("Redis не настроен.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json()) as {
    result?: unknown;
    error?: string;
  };

  if (!response.ok || payload.error) {
    throw new StorefrontPersistenceError(
      payload.error || `Redis вернул HTTP ${response.status}`,
    );
  }

  return payload.result;
}

function getRedisCredentials() {
  return {
    url:
      process.env.UPSTASH_REDIS_REST_URL?.trim() ||
      process.env.KV_REST_API_URL?.trim(),
    token:
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
      process.env.KV_REST_API_TOKEN?.trim(),
  };
}

async function readLocalValue(fileName: string) {
  try {
    return await readFile(path.join(localDirectory, fileName), "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

async function writeLocalValue(fileName: string, value: string) {
  await mkdir(localDirectory, { recursive: true });
  const target = path.join(localDirectory, fileName);
  const temporaryFile = `${target}.${process.pid}.tmp`;
  await writeFile(temporaryFile, value, "utf8");
  await rename(temporaryFile, target);
}

function parseJson<T>(value: string | null) {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function assertWritable(persistence: StorefrontPersistence) {
  if (!persistence.writable) {
    throw new StorefrontPersistenceError(
      persistence.warning ?? "Постоянное хранилище не настроено.",
    );
  }
}

function isMissingFileError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
