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

  if ("badges" in body) {
    if (body.badges === null) {
      patch.badges = null;
    } else {
      if (
        !Array.isArray(body.badges) ||
        body.badges.some((badge) => badge !== "hit" && badge !== "new")
      ) {
        throw new Error("Некорректное значение badges");
      }

      patch.badges = [...new Set(body.badges)];
    }
  }

  // Accept the legacy field so old clients and stored overrides remain valid.
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

export function parseCategoryOrder(value: unknown) {
  const body = assertRecord(value);

  if (!Array.isArray(body.order) || body.order.length === 0) {
    throw new Error("Порядок категорий должен быть непустым массивом");
  }

  const categoryIds = new Set<string>();

  return body.order.map((entry) => {
    const item = assertRecord(entry);

    if (
      typeof item.categoryId !== "string" ||
      item.categoryId.trim().length === 0
    ) {
      throw new Error("categoryId должен быть непустой строкой");
    }

    if (
      typeof item.sortOrder !== "number" ||
      !Number.isInteger(item.sortOrder) ||
      item.sortOrder < 10
    ) {
      throw new Error("sortOrder должен быть целым числом не меньше 10");
    }

    if (categoryIds.has(item.categoryId)) {
      throw new Error("Порядок категорий содержит повторяющийся categoryId");
    }

    categoryIds.add(item.categoryId);

    return {
      categoryId: item.categoryId,
      sortOrder: item.sortOrder,
    };
  });
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
