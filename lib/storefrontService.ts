import {
  fetchIikoExternalMenuSource,
  IikoHttpError,
  type IikoExternalMenuSource,
} from "@/lib/iikoCloudClient";
import type { MenuItemKind, MenuState } from "@/lib/menuStore";
import { readStorefrontOverrides } from "@/lib/storefrontOverrideStore";
import {
  readStorefrontMenuSnapshot,
  writeStorefrontMenuSnapshot,
  type StorefrontMenuSnapshot,
} from "@/lib/storefrontSnapshotStore";
import type {
  StorefrontCategory,
  StorefrontIikoProduct,
  StorefrontItemSize,
  StorefrontModifierGroup,
  StorefrontProduct,
  StorefrontResponse,
} from "@/lib/storefrontTypes";

let memorySnapshot: StorefrontMenuSnapshot | null = null;
let inFlightSync: Promise<StorefrontMenuSnapshot> | null = null;

export class StorefrontIntegrationError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly correlationId: string | null = null,
  ) {
    super(message);
  }
}

export async function getStorefront({
  refresh = false,
}: {
  refresh?: boolean;
} = {}): Promise<StorefrontResponse> {
  const [source, storedOverrides] = await Promise.all([
    getExternalMenuSource(refresh),
    readStorefrontOverrides(),
  ]);
  const categories = normalizeCategories(source, storedOverrides.document);
  const menu = createMenuState(categories);

  return {
    externalMenu: source.externalMenu,
    organization: source.organization,
    terminalGroup: source.terminalGroup,
    syncedAt: source.syncedAt,
    revision: getMenuRevision(source.menu),
    categoriesCount: categories.length,
    productsCount: categories.reduce(
      (sum, category) => sum + category.products.length,
      0,
    ),
    modifiersCount: categories.reduce(
      (sum, category) =>
        sum +
        category.products.reduce(
          (productSum, product) =>
            productSum +
            product.source.modifiers.reduce(
              (modifierSum, group) => modifierSum + group.options.length,
              0,
            ),
          0,
        ),
      0,
    ),
    priceCategoriesCount: source.priceCategoriesCount,
    categories,
    menu,
    persistence: storedOverrides.persistence,
  };
}

async function getExternalMenuSource(refresh: boolean) {
  if (refresh) {
    return (await syncStorefrontMenu()).source;
  }

  try {
    const stored = await readStorefrontMenuSnapshot();

    if (stored.value?.source) {
      memorySnapshot = stored.value;
      return stored.value.source;
    }
  } catch (error) {
    console.warn(
      "Storefront menu snapshot read failed:",
      error instanceof Error ? error.message : "unknown error",
    );
  }

  if (memorySnapshot?.source) {
    return memorySnapshot.source;
  }

  return (await syncStorefrontMenu({ requirePersistence: false })).source;
}

export async function syncStorefrontMenu({
  requirePersistence = true,
}: {
  requirePersistence?: boolean;
} = {}) {
  if (inFlightSync) {
    return inFlightSync;
  }

  inFlightSync = performStorefrontSync(requirePersistence);

  try {
    return await inFlightSync;
  } finally {
    inFlightSync = null;
  }
}

async function performStorefrontSync(requirePersistence: boolean) {
  try {
    const source = await fetchIikoExternalMenuSource();

    try {
      const stored = await writeStorefrontMenuSnapshot(source);
      memorySnapshot = stored.snapshot;
      return stored.snapshot;
    } catch (error) {
      if (requirePersistence) throw error;

      const snapshot: StorefrontMenuSnapshot = {
        version: 1,
        revision: getMenuRevision(source.menu),
        syncedAt: source.syncedAt,
        source,
      };
      memorySnapshot = snapshot;
      console.warn(
        "Storefront menu snapshot write failed:",
        error instanceof Error ? error.message : "unknown error",
      );
      return snapshot;
    }
  } catch (error) {
    if (error instanceof IikoHttpError) {
      throw new StorefrontIntegrationError(
        error.message,
        error.status,
        error.correlationId,
      );
    }

    throw new StorefrontIntegrationError(
      error instanceof Error ? error.message : "Не удалось получить меню iiko",
    );
  }
}

function normalizeCategories(
  source: IikoExternalMenuSource,
  overrides: Awaited<ReturnType<typeof readStorefrontOverrides>>["document"],
) {
  const rawCategories = Array.isArray(source.menu.itemCategories)
    ? source.menu.itemCategories.filter(isRecord)
    : [];

  return rawCategories
    .map<StorefrontCategory>((category, categoryIndex) => {
      const categoryId =
        getString(category.id, category.iikoGroupId) ??
        `external-category-${categoryIndex}`;
      const categoryName = getString(category.name) ?? "Без категории";
      const categoryOverride = overrides.categories[categoryId] ?? {};
      const rawProducts = Array.isArray(category.items)
        ? category.items.filter(isRecord)
        : [];
      const products = rawProducts.map((product, productIndex) =>
        normalizeProduct({
          product,
          productIndex,
          categoryId,
          categoryName,
          organizationId: source.organization.id,
          overrides,
          override: overrides.products[
            getString(product.itemId, product.id) ??
              `${categoryId}:item:${productIndex}`
          ],
        }),
      );

      return {
        source: {
          id: categoryId,
          name: categoryName,
        },
        overrides: categoryOverride,
        display: {
          name: categoryOverride.displayName ?? categoryName,
          isVisible:
            categoryOverride.isVisible ??
            !(category.isHidden === true),
          sortOrder: categoryOverride.sortOrder ?? (categoryIndex + 1) * 10,
        },
        products: products.sort(
          (first, second) => first.display.sortOrder - second.display.sortOrder,
        ),
      };
    })
    .sort(
      (first, second) => first.display.sortOrder - second.display.sortOrder,
    );
}

function normalizeProduct({
  product,
  productIndex,
  categoryId,
  categoryName,
  organizationId,
  overrides,
  override = {},
}: {
  product: Record<string, unknown>;
  productIndex: number;
  categoryId: string;
  categoryName: string;
  organizationId: string;
  overrides: Awaited<ReturnType<typeof readStorefrontOverrides>>["document"];
  override?: StorefrontProduct["overrides"];
}): StorefrontProduct {
  const itemId =
    getString(product.itemId, product.id) ??
    `${categoryId}:item:${productIndex}`;
  const itemSizes = normalizeSizes(product, itemId, organizationId, overrides);
  const defaultSize =
    itemSizes.find((size) => size.isDefault) ?? itemSizes[0] ?? null;
  const imageUrl =
    getString(product.buttonImageUrl) ??
    itemSizes.map((size) => getSizeImage(product, size.id)).find(Boolean) ??
    null;
  const source: StorefrontIikoProduct = {
    itemId,
    sku: getString(product.sku),
    name: getString(product.name) ?? "Без названия",
    description: getString(product.description) ?? "",
    categoryId,
    categoryName,
    price: defaultSize?.price ?? null,
    imageUrl,
    itemSizes,
    modifiers: deduplicateModifierGroups(
      itemSizes.flatMap((size) => size.modifierGroups),
    ),
    tags: getStringArray(product.tags),
    labels: getStringArray(product.labels),
    portionWeightGrams:
      getNumber(product.portionWeightGrams) ??
      defaultSize?.portionWeightGrams ??
      null,
  };

  return {
    source,
    overrides: override,
    display: {
      name: override.displayName ?? source.name,
      description: override.displayDescription ?? source.description,
      price: override.displayPrice ?? source.price,
      image: override.displayImage ?? source.imageUrl,
      isVisible: override.isVisible ?? product.isHidden !== true,
      badges: getProductBadges(override),
      sortOrder: override.sortOrder ?? (productIndex + 1) * 10,
      categoryId: override.customCategoryId ?? categoryId,
    },
  };
}

function normalizeSizes(
  product: Record<string, unknown>,
  itemId: string,
  organizationId: string,
  overrides: Awaited<ReturnType<typeof readStorefrontOverrides>>["document"],
): StorefrontItemSize[] {
  const rawSizes = Array.isArray(product.itemSizes)
    ? product.itemSizes.filter(isRecord)
    : [];

  return rawSizes.map((size, sizeIndex) => {
    const sizeId =
      getString(size.sizeId, size.sizeCode) ?? `${itemId}:size:${sizeIndex}`;

    return {
      id: sizeId,
      name: getString(size.sizeName) ?? "",
      sku: getString(size.sku),
      isDefault: size.isDefault === true,
      price: getOrganizationPrice(size.prices, organizationId),
      portionWeightGrams: getNumber(size.portionWeightGrams),
      modifierGroups: normalizeModifierGroups(
        size.itemModifierGroups,
        itemId,
        sizeId,
        organizationId,
        overrides,
      ),
    };
  });
}

function normalizeModifierGroups(
  value: unknown,
  itemId: string,
  sizeId: string,
  organizationId: string,
  overrides: Awaited<ReturnType<typeof readStorefrontOverrides>>["document"],
): StorefrontModifierGroup[] {
  const groups = Array.isArray(value) ? value.filter(isRecord) : [];

  return groups.map((group, groupIndex) => {
    const restrictions = isRecord(group.restrictions)
      ? group.restrictions
      : {};
    const groupId =
      getString(group.itemGroupId, group.id) ??
      `${itemId}:${sizeId}:modifier-group:${groupIndex}`;
    const options = Array.isArray(group.items)
      ? group.items.filter(isRecord)
      : [];

    return {
      id: groupId,
      name: getString(group.name) ?? "Дополнительно",
      minQuantity: getNumber(restrictions.minQuantity) ?? 0,
      maxQuantity: getNumber(restrictions.maxQuantity) ?? 1,
      options: options.map((option, optionIndex) => {
        const optionRestrictions = isRecord(option.restrictions)
          ? option.restrictions
          : {};
        const optionId =
          getString(option.itemId, option.id) ??
          `${groupId}:option:${optionIndex}`;
        const sourceName = getString(option.name) ?? "Без названия";
        const sourcePrice = getOrganizationPrice(
          option.prices,
          organizationId,
        );
        const optionOverride = overrides.products[optionId] ?? {};

        return {
          itemId: optionId,
          sourceName,
          sourcePrice,
          name: optionOverride.displayName ?? sourceName,
          price: optionOverride.displayPrice ?? sourcePrice,
          isVisible: optionOverride.isVisible ?? option.isHidden !== true,
          overrides: optionOverride,
          minQuantity: getNumber(optionRestrictions.minQuantity) ?? 0,
          maxQuantity: getNumber(optionRestrictions.maxQuantity) ?? 1,
        };
      }),
    };
  });
}

function createMenuState(categories: StorefrontCategory[]): MenuState {
  const products = categories.flatMap((category) => category.products);
  const addonGroups = products.flatMap((product) =>
    product.source.modifiers.map((group, groupIndex) => ({
      id: getClientModifierGroupId(product.source.itemId, group.id),
      name: group.name,
      icon: "",
      required: group.minQuantity > 0,
      selectionType: group.maxQuantity > 1 ? "multiple" as const : "single" as const,
      sortOrder: (groupIndex + 1) * 10,
      isActive: true,
      options: group.options.map((option, optionIndex) => ({
        id: option.itemId,
        name: option.name,
        priceDelta: option.price ?? 0,
        sortOrder: (optionIndex + 1) * 10,
        isActive: option.isVisible,
      })),
    })),
  );

  return {
    categories: categories.map((category) => ({
      id: category.source.id,
      name: category.display.name,
      icon: "",
      isActive: category.display.isVisible,
      sortOrder: category.display.sortOrder,
    })),
    workingZones: [
      {
        id: "bar",
        name: "Бар",
        icon: "",
        isActive: true,
        sortOrder: 10,
      },
      {
        id: "showcase",
        name: "Витрина",
        icon: "",
        isActive: true,
        sortOrder: 20,
      },
    ],
    addonGroups,
    menuItems: products.map((product) => {
      const sizes = product.source.itemSizes;
      const defaultSize =
        sizes.find((size) => size.isDefault) ?? sizes[0] ?? null;
      const basePrice = product.display.price ?? defaultSize?.price ?? 0;
      const visibleSizes = sizes.filter((size) => Boolean(size.name));
      const kind = classifyProduct(product);

      return {
        id: product.source.itemId,
        name: product.display.name,
        description: product.display.description,
        imageSrc: product.display.image || "",
        categoryId: product.display.categoryId,
        workingZoneId: kind === "drink" ? "bar" : "showcase",
        kind,
        basePrice,
        isActive: product.display.isVisible,
        inStock: true,
        badges: product.display.badges,
        sortOrder: product.display.sortOrder,
        variants:
          visibleSizes.length > 1
            ? visibleSizes.map((size, index) => ({
                id: size.id,
                name: size.name,
                priceDelta: (size.price ?? basePrice) - basePrice,
                sortOrder: size.isDefault ? 0 : (index + 1) * 10,
                isActive: true,
              }))
            : [],
        addonGroupIds: product.source.modifiers.map((group) =>
          getClientModifierGroupId(product.source.itemId, group.id),
        ),
      };
    }),
  };
}

function getProductBadges(
  override: StorefrontProduct["overrides"],
): StorefrontProduct["display"]["badges"] {
  if (Array.isArray(override.badges)) {
    return [...new Set(override.badges)].filter(
      (badge) => badge === "hit" || badge === "new",
    );
  }

  return override.badge === "hit" || override.badge === "new"
    ? [override.badge]
    : [];
}

function classifyProduct(product: StorefrontProduct): MenuItemKind {
  const value =
    `${product.source.categoryName} ${product.source.name}`.toLocaleLowerCase(
      "ru-RU",
    );

  if (
    /кофе|капуч|латте|американо|эспрессо|раф|чай|какао|лимонад|напит|смузи|фреш|сок/.test(
      value,
    )
  ) {
    return "drink";
  }

  if (/десерт|торт|пирож|печень|эклер|мусс|лимонный тарт/.test(value)) {
    return "dessert";
  }

  return "food";
}

function getClientModifierGroupId(itemId: string, groupId: string) {
  return `${itemId}:modifier:${groupId}`;
}

function getOrganizationPrice(value: unknown, organizationId: string) {
  const prices = Array.isArray(value) ? value.filter(isRecord) : [];
  const selected =
    prices.find(
      (price) => getString(price.organizationId) === organizationId,
    ) ?? prices[0];

  return selected ? getNumber(selected.price) : null;
}

function getSizeImage(product: Record<string, unknown>, sizeId: string) {
  const sizes = Array.isArray(product.itemSizes)
    ? product.itemSizes.filter(isRecord)
    : [];
  const size = sizes.find(
    (candidate, index) =>
      (getString(candidate.sizeId, candidate.sizeCode) ??
        `${getString(product.itemId, product.id)}:size:${index}`) === sizeId,
  );

  return size ? getString(size.buttonImageUrl) : null;
}

function deduplicateModifierGroups(groups: StorefrontModifierGroup[]) {
  const unique = new Map<string, StorefrontModifierGroup>();

  groups.forEach((group) => {
    if (!unique.has(group.id)) {
      unique.set(group.id, group);
    }
  });

  return [...unique.values()];
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) =>
      typeof item === "string"
        ? item
        : isRecord(item)
          ? getString(item.name, item.value)
          : null,
    )
    .filter((item): item is string => Boolean(item));
}

function getString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMenuRevision(menu: Record<string, unknown>) {
  return typeof menu.revision === "number" && Number.isFinite(menu.revision)
    ? menu.revision
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
