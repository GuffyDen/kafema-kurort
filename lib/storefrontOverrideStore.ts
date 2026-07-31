import type {
  StorefrontCategoryOverride,
  StorefrontOverridesDocument,
  StorefrontProductOverride,
} from "@/lib/storefrontTypes";
import {
  readStorefrontJson,
  storefrontRedisKeys,
  StorefrontPersistenceError,
  writeStorefrontJson,
} from "@/lib/storefrontStorage";

const localFileName = "storefront-overrides.json";

export { StorefrontPersistenceError };

export async function readStorefrontOverrides() {
  const stored = await readStorefrontJson<StorefrontOverridesDocument>(
    storefrontRedisKeys.overrides,
    localFileName,
  );

  return {
    document: normalizeDocument(stored.value),
    persistence: stored.persistence,
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

  await writeDocument(next);
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
  await writeDocument(next);
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

  await writeDocument(next);
  return next;
}

async function writeDocument(document: StorefrontOverridesDocument) {
  await writeStorefrontJson(
    storefrontRedisKeys.overrides,
    localFileName,
    document,
  );
}

function createEmptyDocument(): StorefrontOverridesDocument {
  return {
    version: 1,
    products: {},
    categories: {},
    updatedAt: null,
  };
}

function normalizeDocument(
  value: Partial<StorefrontOverridesDocument> | null,
): StorefrontOverridesDocument {
  if (!value) return createEmptyDocument();

  return {
    version: 1,
    products: value.products ?? {},
    categories: value.categories ?? {},
    updatedAt: value.updatedAt ?? null,
  };
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

function assertWritable(persistence: { writable: boolean; warning: string | null }) {
  if (!persistence.writable) {
    throw new StorefrontPersistenceError(
      persistence.warning ?? "Постоянное хранилище не настроено.",
    );
  }
}
