import type {
  StorefrontCategoryOverride,
  StorefrontProductOverride,
} from "@/lib/storefrontTypes";

export function parseProductOverridePatch(value: unknown) {
  const body = assertRecord(value);
  const patch: Partial<Record<keyof StorefrontProductOverride, unknown>> = {};

  copyNullableString(body, patch, "displayName");
  copyNullableString(body, patch, "displayDescription");
  copyNullableNumber(body, patch, "displayPrice", 0);
  copyNullableString(body, patch, "displayImage");
  copyNullableBoolean(body, patch, "isVisible");
  copyNullableNumber(body, patch, "sortOrder");
  copyNullableString(body, patch, "customCategoryId");

  if ("badge" in body) {
    if (
      body.badge !== null &&
      body.badge !== "none" &&
      body.badge !== "hit" &&
      body.badge !== "new"
    ) {
      throw new Error("Некорректное значение badge");
    }
    patch.badge = body.badge;
  }

  return patch;
}

export function parseCategoryOverridePatch(value: unknown) {
  const body = assertRecord(value);
  const patch: Partial<Record<keyof StorefrontCategoryOverride, unknown>> = {};

  copyNullableString(body, patch, "displayName");
  copyNullableBoolean(body, patch, "isVisible");
  copyNullableNumber(body, patch, "sortOrder");

  return patch;
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Ожидается JSON-объект");
  }

  return value as Record<string, unknown>;
}

function copyNullableString(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
) {
  if (!(key in source)) return;
  const value = source[key];

  if (value !== null && typeof value !== "string") {
    throw new Error(`Поле ${key} должно быть строкой или null`);
  }

  target[key] = value;
}

function copyNullableNumber(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
  minimum?: number,
) {
  if (!(key in source)) return;
  const value = source[key];

  if (
    value !== null &&
    (typeof value !== "number" ||
      !Number.isFinite(value) ||
      (minimum !== undefined && value < minimum))
  ) {
    throw new Error(`Поле ${key} содержит некорректное число`);
  }

  target[key] = value;
}

function copyNullableBoolean(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  key: string,
) {
  if (!(key in source)) return;
  const value = source[key];

  if (value !== null && typeof value !== "boolean") {
    throw new Error(`Поле ${key} должно быть boolean или null`);
  }

  target[key] = value;
}

