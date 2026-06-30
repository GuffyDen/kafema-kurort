"use client";

import { useSyncExternalStore } from "react";

export type MenuItemKind =
  | "drink"
  | "food"
  | "dessert"
  | "combo"
  | "seasonal"
  | "certificate"
  | "other";

export type AddonSelectionType = "single" | "multiple";

export type MenuCategory = {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
};

export type WorkingZone = {
  id: string;
  name: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
};

export type MenuItemVariant = {
  id: string;
  name: string;
  priceDelta: number;
  sortOrder: number;
  isActive: boolean;
};

export type AddonOption = {
  id: string;
  name: string;
  priceDelta: number;
  sortOrder: number;
  isActive: boolean;
};

export type AddonGroup = {
  id: string;
  name: string;
  icon: string;
  required: boolean;
  selectionType: AddonSelectionType;
  sortOrder: number;
  isActive: boolean;
  options: AddonOption[];
};

export type MenuSelection = {
  variantId?: string;
  addonOptionIdsByGroupId: Record<string, string[]>;
};

export type ConfiguredMenuItem = {
  item: MenuItem;
  variant?: MenuItemVariant;
  addonGroups: Array<{
    group: AddonGroup;
    options: AddonOption[];
  }>;
  unitPrice: number;
  summary: string;
  baristaLines: string[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  imageSrc: string;
  categoryId: string;
  workingZoneId: string;
  kind: MenuItemKind;
  basePrice: number;
  isActive: boolean;
  inStock: boolean;
  sortOrder: number;
  variants: MenuItemVariant[];
  addonGroupIds: string[];
};

export type MenuState = {
  categories: MenuCategory[];
  workingZones: WorkingZone[];
  addonGroups: AddonGroup[];
  menuItems: MenuItem[];
};

export type MenuItemInput = Omit<MenuItem, "id" | "variants" | "addonGroupIds">;

type CategoryInput = {
  name: string;
  icon?: string;
};

type WorkingZoneInput = {
  name: string;
  icon?: string;
};

type LegacyProduct = {
  id: string;
  name: string;
  categoryId: string;
  workstationId?: string;
  workingZoneId?: string;
  price?: number;
  basePrice?: number;
  volume?: string;
  description?: string;
  image?: string;
  imageSrc?: string;
  baristaType?: "drink" | "food";
  kind?: MenuItemKind;
  isActive: boolean;
  inStock: boolean;
  sortOrder?: number;
  variants?: MenuItemVariant[];
  modifierGroups?: Array<Omit<AddonGroup, "icon" | "isActive">>;
  addonGroupIds?: string[];
};

type LegacyMenuState = Partial<MenuState> & {
  products?: LegacyProduct[];
  workstations?: WorkingZone[];
};

const storageKey = "kafema-menu-v3";
const legacyStorageKeys = ["kafema-menu-v2", "kafema-menu-v1"];
const channelName = "kafema-menu";

const fallbackImageSrc =
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=85";

export const defaultMenuState: MenuState = {
  categories: [
    { id: "coffee", name: "Кофе", icon: "☕", isActive: true, sortOrder: 10 },
    { id: "bakery", name: "Выпечка", icon: "🥐", isActive: true, sortOrder: 20 },
    { id: "snacks", name: "Перекусы", icon: "🥪", isActive: true, sortOrder: 30 },
    { id: "desserts", name: "Десерты", icon: "🍰", isActive: true, sortOrder: 40 },
    { id: "cold-drinks", name: "Холодные напитки", icon: "🥤", isActive: true, sortOrder: 50 },
  ],
  workingZones: [
    { id: "bar", name: "Бар", icon: "☕", isActive: true, sortOrder: 10 },
    { id: "kitchen", name: "Кухня", icon: "🍳", isActive: true, sortOrder: 20 },
    { id: "showcase", name: "Витрина", icon: "🥐", isActive: true, sortOrder: 30 },
    { id: "cold", name: "Холодный цех", icon: "🥤", isActive: true, sortOrder: 40 },
  ],
  addonGroups: [
    {
      id: "milk",
      name: "Молоко",
      icon: "🥛",
      required: true,
      selectionType: "single",
      sortOrder: 10,
      isActive: true,
      options: [
        { id: "regular-milk", name: "Обычное", priceDelta: 0, sortOrder: 10, isActive: true },
        { id: "oat-milk", name: "Овсяное", priceDelta: 60, sortOrder: 20, isActive: true },
        { id: "coconut-milk", name: "Кокосовое", priceDelta: 60, sortOrder: 30, isActive: true },
        { id: "almond-milk", name: "Миндальное", priceDelta: 80, sortOrder: 40, isActive: true },
      ],
    },
    {
      id: "syrups",
      name: "Сиропы",
      icon: "🍯",
      required: false,
      selectionType: "multiple",
      sortOrder: 20,
      isActive: true,
      options: [
        { id: "vanilla", name: "Ваниль", priceDelta: 40, sortOrder: 10, isActive: true },
        { id: "caramel", name: "Карамель", priceDelta: 40, sortOrder: 20, isActive: true },
        { id: "lavender", name: "Лаванда", priceDelta: 40, sortOrder: 30, isActive: true },
      ],
    },
    {
      id: "sugar",
      name: "Сахар",
      icon: "🍬",
      required: false,
      selectionType: "single",
      sortOrder: 30,
      isActive: true,
      options: [
        { id: "no-sugar", name: "Без сахара", priceDelta: 0, sortOrder: 10, isActive: true },
        { id: "one-spoon", name: "1 ложка", priceDelta: 0, sortOrder: 20, isActive: true },
        { id: "two-spoons", name: "2 ложки", priceDelta: 0, sortOrder: 30, isActive: true },
      ],
    },
    {
      id: "warm",
      name: "Подача",
      icon: "🔥",
      required: false,
      selectionType: "single",
      sortOrder: 40,
      isActive: true,
      options: [
        { id: "not-warmed", name: "Не греть", priceDelta: 0, sortOrder: 10, isActive: true },
        { id: "warmed", name: "Подогреть", priceDelta: 0, sortOrder: 20, isActive: true },
      ],
    },
  ],
  menuItems: [
    createDefaultMenuItem({
      id: "cappuccino",
      name: "Капучино",
      description: "Кофе с молочной пеной",
      categoryId: "coffee",
      workingZoneId: "bar",
      kind: "drink",
      basePrice: 230,
      imageSrc: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=640&q=85",
      sortOrder: 10,
      variants: [
        { id: "cap-300", name: "300 мл", priceDelta: 0, sortOrder: 10, isActive: true },
        { id: "cap-400", name: "400 мл", priceDelta: 50, sortOrder: 20, isActive: true },
      ],
      addonGroupIds: ["milk", "syrups", "sugar"],
    }),
    createDefaultMenuItem({
      id: "latte",
      name: "Латте",
      description: "Мягкий молочный кофе",
      categoryId: "coffee",
      workingZoneId: "bar",
      kind: "drink",
      basePrice: 250,
      imageSrc: "https://images.unsplash.com/photo-1561882468-9110e03e0f78?auto=format&fit=crop&w=640&q=85",
      sortOrder: 20,
      variants: [{ id: "latte-350", name: "350 мл", priceDelta: 0, sortOrder: 10, isActive: true }],
      addonGroupIds: ["milk", "syrups", "sugar"],
    }),
    createDefaultMenuItem({
      id: "americano",
      name: "Американо",
      description: "Черный кофе",
      categoryId: "coffee",
      workingZoneId: "bar",
      kind: "drink",
      basePrice: 190,
      imageSrc: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=85",
      sortOrder: 30,
      addonGroupIds: ["sugar"],
    }),
    createDefaultMenuItem({
      id: "croissant",
      name: "Круассан",
      description: "Свежая выпечка",
      categoryId: "bakery",
      workingZoneId: "showcase",
      kind: "food",
      basePrice: 210,
      imageSrc: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=640&q=85",
      sortOrder: 40,
      addonGroupIds: ["warm"],
    }),
    createDefaultMenuItem({
      id: "cheesecake",
      name: "Чизкейк",
      description: "Десерт из витрины",
      categoryId: "desserts",
      workingZoneId: "showcase",
      kind: "dessert",
      basePrice: 290,
      imageSrc: "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=640&q=85",
      sortOrder: 50,
      addonGroupIds: [],
    }),
  ],
};

let menuState = defaultMenuState;
let hydrated = false;
let channel: BroadcastChannel | null = null;
const listeners = new Set<() => void>();

function createDefaultMenuItem(
  item: Omit<MenuItem, "isActive" | "inStock" | "variants" | "addonGroupIds"> &
    Partial<Pick<MenuItem, "variants" | "addonGroupIds">>,
): MenuItem {
  return {
    ...item,
    imageSrc: item.imageSrc || fallbackImageSrc,
    isActive: true,
    inStock: true,
    variants: item.variants ?? [],
    addonGroupIds: item.addonGroupIds ?? [],
  };
}

function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getChannel() {
  if (typeof BroadcastChannel === "undefined") {
    return null;
  }

  if (!channel) {
    channel = new BroadcastChannel(channelName);
    channel.addEventListener("message", (event: MessageEvent<MenuState>) => {
      if (!event.data?.categories) return;
      menuState = normalizeMenuState(event.data);
      saveMenu(false);
      notify();
    });
  }

  return channel;
}

function hydrateMenu() {
  if (hydrated || !canUseBrowserStorage()) return;
  hydrated = true;

  const savedMenu =
    localStorage.getItem(storageKey) ??
    legacyStorageKeys.map((key) => localStorage.getItem(key)).find(Boolean);

  if (!savedMenu) {
    saveMenu(false);
    return;
  }

  try {
    menuState = normalizeMenuState(JSON.parse(savedMenu) as LegacyMenuState);
    saveMenu(false);
  } catch {
    menuState = defaultMenuState;
    saveMenu(false);
  }
}

function saveMenu(shouldBroadcast = true) {
  if (!canUseBrowserStorage()) return;
  localStorage.setItem(storageKey, JSON.stringify(menuState));
  if (shouldBroadcast) getChannel()?.postMessage(menuState);
}

function notify() {
  listeners.forEach((listener) => listener());
}

function setMenuState(nextState: MenuState) {
  menuState = normalizeMenuState(nextState);
  saveMenu();
  notify();
}

function getSnapshot() {
  hydrateMenu();
  return menuState;
}

function getServerSnapshot() {
  return defaultMenuState;
}

function subscribe(listener: () => void) {
  hydrateMenu();
  getChannel();
  listeners.add(listener);

  function syncStorage(event: StorageEvent) {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      menuState = normalizeMenuState(JSON.parse(event.newValue) as MenuState);
      notify();
    } catch {
      // Ignore malformed storage updates.
    }
  }

  window.addEventListener("storage", syncStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", syncStorage);
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function normalizeMenuState(state: LegacyMenuState): MenuState {
  const categories = (state.categories?.length ? state.categories : defaultMenuState.categories).map((category, index) => ({
    ...category,
    icon: category.icon || "•",
    isActive: category.isActive ?? true,
    sortOrder: category.sortOrder ?? (index + 1) * 10,
  }));
  const workingZones = (state.workingZones ?? ("workstations" in state ? state.workstations : undefined) ?? defaultMenuState.workingZones).map((zone, index) => ({
    id: zone.id,
    name: zone.name,
    icon: zone.icon || "•",
    isActive: zone.isActive ?? true,
    sortOrder: zone.sortOrder ?? (index + 1) * 10,
  }));
  const extractedAddonGroups = extractAddonGroups(state);
  const addonGroups = (state.addonGroups?.length ? state.addonGroups : extractedAddonGroups.length ? extractedAddonGroups : defaultMenuState.addonGroups).map(normalizeAddonGroup);
  const rawItems = state.menuItems ?? state.products ?? defaultMenuState.menuItems;

  return {
    categories,
    workingZones,
    addonGroups,
    menuItems: rawItems.map((item, index) => normalizeMenuItem(item as MenuItem | LegacyProduct, index, addonGroups)),
  };
}

function extractAddonGroups(state: LegacyMenuState) {
  const groups = new Map<string, AddonGroup>();
  const items = state.menuItems ?? state.products ?? [];
  items.forEach((item) => {
    if (!("modifierGroups" in item) || !Array.isArray(item.modifierGroups)) return;
    item.modifierGroups.forEach((group) => {
      groups.set(group.id, normalizeAddonGroup({ ...group, icon: "•", isActive: true }));
    });
  });
  return [...groups.values()];
}

function normalizeAddonGroup(group: AddonGroup): AddonGroup {
  return {
    ...group,
    icon: group.icon || "•",
    required: group.required ?? false,
    selectionType: group.selectionType ?? "single",
    sortOrder: group.sortOrder ?? 10,
    isActive: group.isActive ?? true,
    options: group.options.map((option, index) => ({
      ...option,
      priceDelta: Number(option.priceDelta) || 0,
      sortOrder: option.sortOrder ?? (index + 1) * 10,
      isActive: option.isActive ?? true,
    })),
  };
}

function normalizeMenuItem(item: MenuItem | LegacyProduct, index: number, addonGroups: AddonGroup[]): MenuItem {
  const legacyVolume = "volume" in item ? item.volume : "";
  const legacyPrice = "price" in item ? item.price : undefined;
  const legacyImage = "image" in item ? item.image : undefined;
  const legacyBaristaType = "baristaType" in item ? item.baristaType : undefined;
  const legacyGroupIds =
    "modifierGroups" in item && Array.isArray(item.modifierGroups)
      ? item.modifierGroups.map((group) => group.id)
      : [];
  const addonGroupIds =
    "addonGroupIds" in item && Array.isArray(item.addonGroupIds)
      ? item.addonGroupIds
      : legacyGroupIds.filter((groupId) => addonGroups.some((group) => group.id === groupId));

  return {
    id: item.id,
    name: item.name,
    description: "description" in item && item.description ? item.description : legacyVolume || "",
    imageSrc: item.imageSrc || legacyImage || fallbackImageSrc,
    categoryId: item.categoryId,
    workingZoneId:
      ("workingZoneId" in item && item.workingZoneId) ||
      ("workstationId" in item && item.workstationId) ||
      (legacyBaristaType === "food" ? "showcase" : "bar"),
    kind: "kind" in item && item.kind ? item.kind : legacyBaristaType === "food" ? "food" : "drink",
    basePrice: "basePrice" in item && typeof item.basePrice === "number" ? item.basePrice : legacyPrice ?? 0,
    isActive: item.isActive ?? true,
    inStock: item.inStock ?? true,
    sortOrder: "sortOrder" in item && typeof item.sortOrder === "number" ? item.sortOrder : (index + 1) * 10,
    variants:
      "variants" in item && Array.isArray(item.variants)
        ? item.variants.map((variant, variantIndex) => ({
            ...variant,
            priceDelta: Number(variant.priceDelta) || 0,
            sortOrder: variant.sortOrder ?? (variantIndex + 1) * 10,
            isActive: variant.isActive ?? true,
          }))
        : legacyVolume
          ? [{ id: `${item.id}-default-variant`, name: legacyVolume, priceDelta: 0, sortOrder: 10, isActive: true }]
          : [],
    addonGroupIds,
  };
}

export function getMenuItemPrice(item: MenuItem) {
  const firstVariant = [...item.variants].filter((variant) => variant.isActive).sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return item.basePrice + (firstVariant?.priceDelta ?? 0);
}

export function getMenuItemSummary(item: MenuItem) {
  const firstVariant = [...item.variants].filter((variant) => variant.isActive).sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return firstVariant?.name || item.description;
}

export function getMenuItemWorkstationType(item: MenuItem) {
  return item.workingZoneId === "bar" || item.workingZoneId === "cold" ? "drink" : "food";
}

export function getAvailableVariants(item: MenuItem) {
  return [...item.variants].filter((variant) => variant.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getMenuItemAddonGroups(menu: MenuState, item: MenuItem) {
  return item.addonGroupIds
    .map((groupId) => menu.addonGroups.find((group) => group.id === groupId && group.isActive))
    .filter((group): group is AddonGroup => Boolean(group))
    .map((group) => ({
      ...group,
      options: [...group.options].filter((option) => option.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((group) => group.options.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function isMenuItemOrderable(menu: MenuState, item: MenuItem) {
  if (!item.isActive || !item.inStock) return false;
  const category = menu.categories.find((currentCategory) => currentCategory.id === item.categoryId);
  if (!category?.isActive) return false;
  if (item.variants.length > 0 && getAvailableVariants(item).length === 0) return false;

  return item.addonGroupIds.every((groupId) => {
    const group = menu.addonGroups.find((currentGroup) => currentGroup.id === groupId && currentGroup.isActive);
    if (!group?.required) return true;
    return group.options.some((option) => option.isActive);
  });
}

export function getDefaultMenuSelection(menu: MenuState, item: MenuItem): MenuSelection {
  const firstVariant = getAvailableVariants(item)[0];
  const addonOptionIdsByGroupId = getMenuItemAddonGroups(menu, item).reduce<Record<string, string[]>>((acc, group) => {
    if (group.required && group.selectionType === "single") {
      acc[group.id] = group.options[0] ? [group.options[0].id] : [];
    } else {
      acc[group.id] = [];
    }

    return acc;
  }, {});

  return {
    variantId: firstVariant?.id,
    addonOptionIdsByGroupId,
  };
}

export function configureMenuItem(menu: MenuState, item: MenuItem, selection: MenuSelection): ConfiguredMenuItem {
  const variant = getAvailableVariants(item).find((currentVariant) => currentVariant.id === selection.variantId);
  const addonGroups = getMenuItemAddonGroups(menu, item).map((group) => {
    const selectedIds = new Set(selection.addonOptionIdsByGroupId[group.id] ?? []);
    return {
      group,
      options: group.options.filter((option) => selectedIds.has(option.id)),
    };
  });
  const addonTotal = addonGroups.reduce(
    (sum, group) => sum + group.options.reduce((groupSum, option) => groupSum + option.priceDelta, 0),
    0,
  );
  const unitPrice = item.basePrice + (variant?.priceDelta ?? 0) + addonTotal;
  const baristaLines = addonGroups.flatMap(({ options }) => options.map((option) => option.name));

  return {
    item,
    variant,
    addonGroups,
    unitPrice,
    summary: variant?.name || item.description,
    baristaLines,
  };
}

export function isMenuSelectionComplete(menu: MenuState, item: MenuItem, selection: MenuSelection) {
  if (item.variants.length > 0 && !selection.variantId) return false;

  return getMenuItemAddonGroups(menu, item).every((group) => {
    if (!group.required) return true;
    return (selection.addonOptionIdsByGroupId[group.id] ?? []).length > 0;
  });
}

export function addCategory(input: CategoryInput) {
  hydrateMenu();
  const category: MenuCategory = {
    id: createId("category"),
    name: input.name.trim(),
    icon: input.icon?.trim() || "•",
    isActive: true,
    sortOrder: (menuState.categories.length + 1) * 10,
  };
  if (!category.name) return;
  setMenuState({ ...menuState, categories: [...menuState.categories, category] });
}

export function updateCategory(categoryId: string, updates: Partial<Pick<MenuCategory, "name" | "icon" | "isActive" | "sortOrder">>) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    categories: menuState.categories.map((category) =>
      category.id === categoryId
        ? { ...category, ...updates, name: updates.name?.trim() || category.name, icon: updates.icon?.trim() || category.icon }
        : category,
    ),
  });
}

export function addWorkingZone(input: WorkingZoneInput) {
  hydrateMenu();
  const zone: WorkingZone = {
    id: createId("zone"),
    name: input.name.trim(),
    icon: input.icon?.trim() || "•",
    isActive: true,
    sortOrder: (menuState.workingZones.length + 1) * 10,
  };
  if (!zone.name) return;
  setMenuState({ ...menuState, workingZones: [...menuState.workingZones, zone] });
}

export function updateWorkingZone(zoneId: string, updates: Partial<Pick<WorkingZone, "name" | "icon" | "isActive" | "sortOrder">>) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    workingZones: menuState.workingZones.map((zone) =>
      zone.id === zoneId ? { ...zone, ...updates, name: updates.name?.trim() || zone.name, icon: updates.icon?.trim() || zone.icon } : zone,
    ),
  });
}

export function addMenuItem(input: MenuItemInput) {
  hydrateMenu();
  const menuItem = normalizeMenuItem({ ...input, id: createId("menu-item"), variants: [], addonGroupIds: [] }, menuState.menuItems.length, menuState.addonGroups);
  if (!menuItem.name.trim()) return;
  setMenuState({ ...menuState, menuItems: [...menuState.menuItems, menuItem] });
}

export function updateMenuItem(menuItemId: string, updates: Partial<MenuItemInput>) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    menuItems: menuState.menuItems.map((item) =>
      item.id === menuItemId ? normalizeMenuItem({ ...item, ...updates }, 0, menuState.addonGroups) : item,
    ),
  });
}

export function setMenuItemAddonGroup(menuItemId: string, addonGroupId: string, enabled: boolean) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    menuItems: menuState.menuItems.map((item) => {
      if (item.id !== menuItemId) return item;
      const nextIds = enabled
        ? Array.from(new Set([...item.addonGroupIds, addonGroupId]))
        : item.addonGroupIds.filter((id) => id !== addonGroupId);
      return { ...item, addonGroupIds: nextIds };
    }),
  });
}

export function addVariant(menuItemId: string, input: Omit<MenuItemVariant, "id">) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    menuItems: menuState.menuItems.map((item) =>
      item.id === menuItemId
        ? { ...item, variants: [...item.variants, { ...input, id: createId("variant"), name: input.name.trim(), priceDelta: Number(input.priceDelta) || 0 }] }
        : item,
    ),
  });
}

export function updateVariant(menuItemId: string, variantId: string, updates: Partial<Omit<MenuItemVariant, "id">>) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    menuItems: menuState.menuItems.map((item) =>
      item.id === menuItemId
        ? {
            ...item,
            variants: item.variants.map((variant) =>
              variant.id === variantId
                ? {
                    ...variant,
                    ...updates,
                    name: updates.name?.trim() || variant.name,
                    priceDelta: updates.priceDelta === undefined ? variant.priceDelta : Number(updates.priceDelta) || 0,
                  }
                : variant,
            ),
          }
        : item,
    ),
  });
}

export function addAddonGroup(input: Omit<AddonGroup, "id" | "options">) {
  hydrateMenu();
  const group = normalizeAddonGroup({ ...input, id: createId("addon-group"), name: input.name.trim(), options: [] });
  if (!group.name) return;
  setMenuState({ ...menuState, addonGroups: [...menuState.addonGroups, group] });
}

export function updateAddonGroup(groupId: string, updates: Partial<Omit<AddonGroup, "id" | "options">>) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    addonGroups: menuState.addonGroups.map((group) =>
      group.id === groupId ? normalizeAddonGroup({ ...group, ...updates, name: updates.name?.trim() || group.name }) : group,
    ),
  });
}

export function addAddonOption(groupId: string, input: Omit<AddonOption, "id">) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    addonGroups: menuState.addonGroups.map((group) =>
      group.id === groupId
        ? { ...group, options: [...group.options, { ...input, id: createId("addon-option"), name: input.name.trim(), priceDelta: Number(input.priceDelta) || 0 }] }
        : group,
    ),
  });
}

export function updateAddonOption(groupId: string, optionId: string, updates: Partial<Omit<AddonOption, "id">>) {
  hydrateMenu();
  setMenuState({
    ...menuState,
    addonGroups: menuState.addonGroups.map((group) =>
      group.id === groupId
        ? {
            ...group,
            options: group.options.map((option) =>
              option.id === optionId
                ? {
                    ...option,
                    ...updates,
                    name: updates.name?.trim() || option.name,
                    priceDelta: updates.priceDelta === undefined ? option.priceDelta : Number(updates.priceDelta) || 0,
                  }
                : option,
            ),
          }
        : group,
    ),
  });
}

export function useMenu() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
