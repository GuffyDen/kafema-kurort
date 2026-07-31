import type { MenuState } from "@/lib/menuStore";

export type StorefrontBadge = "none" | "hit" | "new";

export type StorefrontProductOverride = {
  displayName?: string;
  displayDescription?: string;
  displayPrice?: number;
  displayImage?: string;
  isVisible?: boolean;
  badge?: StorefrontBadge;
  sortOrder?: number;
  customCategoryId?: string;
};

export type StorefrontCategoryOverride = {
  displayName?: string;
  isVisible?: boolean;
  sortOrder?: number;
};

export type StorefrontModifierOption = {
  itemId: string;
  sourceName: string;
  sourcePrice: number | null;
  name: string;
  price: number | null;
  isVisible: boolean;
  overrides: StorefrontProductOverride;
  minQuantity: number;
  maxQuantity: number;
};

export type StorefrontModifierGroup = {
  id: string;
  name: string;
  minQuantity: number;
  maxQuantity: number;
  options: StorefrontModifierOption[];
};

export type StorefrontItemSize = {
  id: string;
  name: string;
  sku: string | null;
  isDefault: boolean;
  price: number | null;
  portionWeightGrams: number | null;
  modifierGroups: StorefrontModifierGroup[];
};

export type StorefrontIikoProduct = {
  itemId: string;
  sku: string | null;
  name: string;
  description: string;
  categoryId: string;
  categoryName: string;
  price: number | null;
  imageUrl: string | null;
  itemSizes: StorefrontItemSize[];
  modifiers: StorefrontModifierGroup[];
  tags: string[];
  labels: string[];
  portionWeightGrams: number | null;
};

export type StorefrontProduct = {
  source: StorefrontIikoProduct;
  overrides: StorefrontProductOverride;
  display: {
    name: string;
    description: string;
    price: number | null;
    image: string | null;
    isVisible: boolean;
    badge: StorefrontBadge;
    sortOrder: number;
    categoryId: string;
  };
};

export type StorefrontCategory = {
  source: {
    id: string;
    name: string;
  };
  overrides: StorefrontCategoryOverride;
  display: {
    name: string;
    isVisible: boolean;
    sortOrder: number;
  };
  products: StorefrontProduct[];
};

export type StorefrontPersistence = {
  mode: "redis" | "local-file" | "unconfigured";
  writable: boolean;
  warning: string | null;
};

export type StorefrontResponse = {
  externalMenu: {
    id: string;
    name: string | null;
  };
  organization: {
    id: string;
    name: string;
  };
  terminalGroup: {
    id: string;
    name: string | null;
  };
  syncedAt: string;
  revision: number | null;
  categoriesCount: number;
  productsCount: number;
  modifiersCount: number;
  priceCategoriesCount: number;
  categories: StorefrontCategory[];
  menu: MenuState;
  persistence: StorefrontPersistence;
};

export type StorefrontSyncStatus = {
  menuSyncedAt: string;
  stopListCheckedAt: string | null;
  stopListStale: boolean;
  lastError: {
    at: string;
    message: string;
  } | null;
};

export type StorefrontAdminResponse = StorefrontResponse & {
  syncStatus: StorefrontSyncStatus;
};

export type StorefrontOverridesDocument = {
  version: 1;
  products: Record<string, StorefrontProductOverride>;
  categories: Record<string, StorefrontCategoryOverride>;
  updatedAt: string | null;
};
