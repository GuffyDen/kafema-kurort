import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  StorefrontCategoryOverride,
  StorefrontOverridesDocument,
  StorefrontPersistence,
  StorefrontProductOverride,
} from "@/lib/storefrontTypes";

const redisKey = "tablo:kafema-sanatornaya:storefront-overrides:v1";
const localDirectory = path.join(process.cwd(), ".data");
const localFile = path.join(localDirectory, "storefront-overrides.json");

export class StorefrontPersistenceError extends Error {}

export async function readStorefrontOverrides() {
  const persistence = getStorefrontPersistence();

  if (persistence.mode === "redis") {
    return {
      document: await readRedisDocument(),
      persistence,
    };
  }

  if (persistence.mode === "local-file") {
    return {
      document: await readLocalDocument(),
      persistence,
    };
  }

  return {
    document: createEmptyDocument(),
    persistence,
  };
}

export async function patchProductOverride(
  itemId: string,
  patch: Partial<Record<keyof StorefrontProductOverride, unknown>>,
) {
  const { document, persistence } = await readStorefrontOverrides();
  assertWritable(persistence);
  const current = { ...(document.products[itemId] ?? {}) };

  applyPatch(current, patch);
  const next = {
    ...document,
    products: {
      ...document.products,
      [itemId]: current,
    },
    updatedAt: new Date().toISOString(),
  };

  if (Object.keys(current).length === 0) {
    delete next.products[itemId];
  }

  await writeDocument(next, persistence);
  return next;
}

export async function deleteProductOverride(itemId: string) {
  const { document, persistence } = await readStorefrontOverrides();
  assertWritable(persistence);
  const products = { ...document.products };
  delete products[itemId];
  const next = {
    ...document,
    products,
    updatedAt: new Date().toISOString(),
  };
  await writeDocument(next, persistence);
  return next;
}

export async function patchCategoryOverride(
  categoryId: string,
  patch: Partial<Record<keyof StorefrontCategoryOverride, unknown>>,
) {
  const { document, persistence } = await readStorefrontOverrides();
  assertWritable(persistence);
  const current = { ...(document.categories[categoryId] ?? {}) };

  applyPatch(current, patch);
  const next = {
    ...document,
    categories: {
      ...document.categories,
      [categoryId]: current,
    },
    updatedAt: new Date().toISOString(),
  };

  if (Object.keys(current).length === 0) {
    delete next.categories[categoryId];
  }

  await writeDocument(next, persistence);
  return next;
}

function getStorefrontPersistence(): StorefrontPersistence {
  const redisUrl =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const redisToken =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();

  if (redisUrl && redisToken) {
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
        "Локальный режим: overrides хранятся в .data. Для Vercel подключите Redis.",
    };
  }

  return {
    mode: "unconfigured",
    writable: false,
    warning:
      "Постоянное хранилище не подключено. Добавьте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN.",
  };
}

async function readRedisDocument() {
  const result = await executeRedisCommand(["GET", redisKey]);

  if (typeof result !== "string") {
    return createEmptyDocument();
  }

  return parseDocument(result);
}

async function readLocalDocument() {
  try {
    return parseDocument(await readFile(localFile, "utf8"));
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyDocument();
    }

    throw error;
  }
}

async function writeDocument(
  document: StorefrontOverridesDocument,
  persistence: StorefrontPersistence,
) {
  if (persistence.mode === "redis") {
    await executeRedisCommand(["SET", redisKey, JSON.stringify(document)]);
    return;
  }

  if (persistence.mode === "local-file") {
    await mkdir(localDirectory, { recursive: true });
    const temporaryFile = `${localFile}.${process.pid}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(document, null, 2), "utf8");
    await rename(temporaryFile, localFile);
    return;
  }

  throw new StorefrontPersistenceError(
    persistence.warning ?? "Постоянное хранилище не настроено.",
  );
}

async function executeRedisCommand(command: string[]) {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim();

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

function createEmptyDocument(): StorefrontOverridesDocument {
  return {
    version: 1,
    products: {},
    categories: {},
    updatedAt: null,
  };
}

function parseDocument(value: string): StorefrontOverridesDocument {
  try {
    const parsed = JSON.parse(value) as Partial<StorefrontOverridesDocument>;

    return {
      version: 1,
      products: parsed.products ?? {},
      categories: parsed.categories ?? {},
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return createEmptyDocument();
  }
}

function applyPatch(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      delete target[key];
    } else {
      target[key] = value;
    }
  });
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
