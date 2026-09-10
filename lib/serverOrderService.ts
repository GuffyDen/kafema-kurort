import { assertPaymentCreationEnabled } from "@/lib/yookassaClient";
import { buildYookassaReceipt, YOOKASSA_RECEIPT_VERSION } from "@/lib/yookassaReceipt";
import { normalizeOrderPhone } from "@/lib/orderPhone";
import { normalizeOrderEmail } from "@/lib/orderEmail";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { AddonGroup, MenuItem, MenuSelection, MenuState } from "@/lib/menuStore";
import {
  PERSONAL_DATA_CONSENT_VERSION,
  type BaristaOrder,
  type CreateOrderInput,
  type CustomerOrder,
  type OrderStatus,
  type ServerOrder,
  type ServerOrderItem,
} from "@/lib/orderTypes";
import {
  createPersistedOrder,
  getPersistedOrder,
  listPersistedOrders,
  updatePersistedOrderStatus,
} from "@/lib/serverOrderRepository";
import { hashOrderAccessToken, verifyOrderAccessToken } from "@/lib/serverOrderSecurity";
import { getStorefrontAvailability } from "@/lib/storefrontAvailabilityService";
import { getStorefront } from "@/lib/storefrontService";
import { StorefrontPersistenceError } from "@/lib/storefrontStorage";
import { getTenantId } from "@/lib/tenantSettingsStore";

const maximumItems = 50;
const maximumQuantity = 50;
const maximumCustomerNameLength = 80;
const maximumCommentLength = 500;
const maximumIdentifierLength = 200;
const statusTransitions: Record<OrderStatus, OrderStatus | null> = {
  new: "in_progress",
  in_progress: "ready",
  ready: "completed",
  completed: null,
};

export class OrderServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export async function createServerOrder(rawInput: unknown, idempotencyKey: string) {
  const paymentConfig = assertPaymentCreationEnabled();
  const input = validateCreateInput(rawInput);
  validateIdempotencyKey(idempotencyKey);
  const tenantId = getTenantId();

  let storefront: Awaited<ReturnType<typeof getStorefront>>;
  let availability: Awaited<ReturnType<typeof getStorefrontAvailability>>;
  try {
    [storefront, availability] = await Promise.all([
      getStorefront(),
      getStorefrontAvailability(),
    ]);
  } catch {
    throw new OrderServiceError(
      "Не удалось проверить актуальные цены и наличие. Попробуйте ещё раз.",
      503,
      "STOREFRONT_UNAVAILABLE",
    );
  }

  const items = buildOrderItemSnapshots(input.items, storefront.menu);
  assertAvailable(items, input.items, availability);
  const totalMinor = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
  // Validate contact, fiscal item support and totals before persisting an intent.
  buildYookassaReceipt({ phone: input.phone, email: input.email, items, totalMinor });
  const accessToken = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();

  for (let attempt = 0; attempt < 900; attempt += 1) {
    const order: ServerOrder = {
      id: randomUUID(),
      number: String(randomInt(100, 1000)),
      tenantId,
      ...(paymentConfig ? { payment: {
        mode: paymentConfig.mode,
        status: "pending" as const, revision: 0, idempotencyKey: randomUUID(),
        initiatedAt: now, shopId: paymentConfig.shopId,
        receiptVersion: YOOKASSA_RECEIPT_VERSION,
        returnUrl: `${paymentConfig.origin}/payment/return`,
      } } : {}),
      customerName: input.customerName,
      phone: input.phone,
      email: input.email,
      fiscal: { revision: 0, prepayment: { status: "not_created" } },
      comment: input.comment,
      items,
      totalMinor,
      status: "new",
      source: "client",
      createdAt: now,
      statusChangedAt: now,
      personalDataConsent: true,
      personalDataConsentAt: now,
      personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
      customerAccessTokenHash: hashOrderAccessToken(accessToken),
    };

    if (order.payment) order.payment.returnUrl += `?orderId=${order.id}`;

    try {
      const result = await createPersistedOrder({
        order,
        accessToken,
        idempotencyKey,
      });
      if (result.kind === "number-conflict") continue;
      return {
        order: toCustomerOrder(result.order),
        accessToken: result.accessToken,
        idempotent: result.kind === "idempotent",
      };
    } catch (error) {
      throw mapPersistenceError(error);
    }
  }

  throw new OrderServiceError(
    "Не удалось назначить номер заказа. Попробуйте ещё раз.",
    503,
    "ORDER_NUMBER_EXHAUSTED",
  );
}

export async function getCustomerOrder(orderId: string, accessToken: string) {
  validateOrderId(orderId);
  const tenantId = getTenantId();
  let order: ServerOrder | null;
  try {
    order = await getPersistedOrder(tenantId, orderId);
  } catch (error) {
    throw mapPersistenceError(error);
  }
  if (!order || !verifyOrderAccessToken(accessToken, order.customerAccessTokenHash)) {
    throw new OrderServiceError("Заказ не найден.", 404, "ORDER_NOT_FOUND");
  }
  return toCustomerOrder(order);
}

// Single gate for the queue and every fulfilment status transition. A future
// iiko outbox should consume the atomic pending -> succeeded transition, not a redirect.
function isOrderReadyForPreparation(order: ServerOrder) {
  if (order.payment?.status !== "succeeded") return false;
  return order.payment.mode === "live" || process.env.VERCEL_ENV !== "production";
}

export async function listBaristaOrders() {
  const tenantId = getTenantId();
  try {
    const orders = await listPersistedOrders(tenantId);
    return orders.filter(isOrderReadyForPreparation).map(toBaristaOrder);
  } catch (error) {
    throw mapPersistenceError(error);
  }
}

export async function updateServerOrderStatus(orderId: string, nextStatus: unknown) {
  validateOrderId(orderId);
  if (
    nextStatus !== "new" &&
    nextStatus !== "in_progress" &&
    nextStatus !== "ready" &&
    nextStatus !== "completed"
  ) {
    throw new OrderServiceError("Некорректный статус заказа.", 400, "INVALID_STATUS");
  }

  const tenantId = getTenantId();
  let current: ServerOrder | null;
  try {
    current = await getPersistedOrder(tenantId, orderId);
  } catch (error) {
    throw mapPersistenceError(error);
  }
  if (!current) {
    throw new OrderServiceError("Заказ не найден.", 404, "ORDER_NOT_FOUND");
  }
  if (!isOrderReadyForPreparation(current)) {
    throw new OrderServiceError("Заказ ещё не оплачен.", 409, "ORDER_UNPAID");
  }
  if (current.status === "completed" && nextStatus === "completed") return toBaristaOrder(current);
  if (statusTransitions[current.status] !== nextStatus) {
    throw new OrderServiceError(
      "Недопустимый переход статуса заказа.",
      409,
      "INVALID_STATUS_TRANSITION",
    );
  }

  const now = new Date().toISOString();
  const updated: ServerOrder = {
    ...current,
    status: nextStatus,
    statusChangedAt: now,
    ...(nextStatus === "completed" ? { completedAt: now } : {}),
  };
  if (nextStatus === "completed" && !current.fiscal?.settlement) {
    const supported = current.payment?.receiptVersion === YOOKASSA_RECEIPT_VERSION && Boolean(normalizeOrderEmail(current.email));
    updated.fiscal = {
      ...current.fiscal,
      revision: current.fiscal?.revision ?? 0,
      prepayment: current.fiscal?.prepayment ?? { status: "unknown" },
      settlement: { state: supported ? "pending" : "needs_review", idempotencyKey: randomUUID(), requiredAt: now, attempts: 0 },
      nextAttemptAt: supported ? Date.now() : undefined,
      lastError: supported ? undefined : "FISCAL_LEGACY_ORDER_REVIEW_REQUIRED",
    };
  }
  let saved: ServerOrder | null;
  try {
    saved = await updatePersistedOrderStatus({
      tenantId,
      orderId,
      expectedStatus: current.status,
      order: updated,
    });
  } catch (error) {
    throw mapPersistenceError(error);
  }
  if (!saved) {
    const latest = await getPersistedOrder(tenantId, orderId);
    if (nextStatus === "completed" && latest?.status === "completed") return toBaristaOrder(latest);
    throw new OrderServiceError(
      "Статус уже изменён другим бариста. Обновите очередь.",
      409,
      "STATUS_CONFLICT",
    );
  }
  return toBaristaOrder(saved);
}

function validateCreateInput(value: unknown): CreateOrderInput {
  if (!isRecord(value)) invalid("Некорректное тело запроса.", "INVALID_BODY");
  const customerName = requireTrimmedString(
    value.customerName,
    "Укажите имя.",
    maximumCustomerNameLength,
  );
  const phone = normalizePhone(value.phone);
  const email = normalizeOrderEmail(value.email);
  if (!email) invalid("Введите корректный email для электронного чека.", "INVALID_EMAIL");
  const comment = optionalTrimmedString(value.comment, maximumCommentLength, "Комментарий слишком длинный.");

  if (value.personalDataConsent !== true) {
    invalid("Для создания заказа необходимо согласие на обработку персональных данных.", "CONSENT_REQUIRED");
  }
  if (value.personalDataConsentVersion !== PERSONAL_DATA_CONSENT_VERSION) {
    invalid("Версия согласия не поддерживается.", "INVALID_CONSENT_VERSION");
  }
  if (!Array.isArray(value.items) || value.items.length === 0 || value.items.length > maximumItems) {
    invalid("Заказ должен содержать от 1 до 50 позиций.", "INVALID_ITEMS");
  }

  const items = value.items.map((item) => validateCreateItem(item));
  return {
    customerName,
    phone,
    email,
    comment,
    items,
    personalDataConsent: true,
    personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
  };
}

function validateCreateItem(value: unknown): CreateOrderInput["items"][number] {
  if (!isRecord(value)) invalid("Некорректная позиция заказа.", "INVALID_ITEM");
  const productId = requireIdentifier(value.productId);
  if (!Number.isInteger(value.quantity) || Number(value.quantity) < 1 || Number(value.quantity) > maximumQuantity) {
    invalid("Некорректное количество позиции.", "INVALID_QUANTITY");
  }
  if (!isRecord(value.selection) || !isRecord(value.selection.addonOptionIdsByGroupId)) {
    invalid("Некорректная конфигурация позиции.", "INVALID_SELECTION");
  }

  const addonOptionIdsByGroupId: Record<string, string[]> = {};
  for (const [groupId, optionIds] of Object.entries(value.selection.addonOptionIdsByGroupId)) {
    requireIdentifier(groupId);
    if (!Array.isArray(optionIds) || optionIds.length > 50) {
      invalid("Некорректные модификаторы позиции.", "INVALID_SELECTION");
    }
    addonOptionIdsByGroupId[groupId] = optionIds.map(requireIdentifier);
  }

  return {
    productId,
    quantity: Number(value.quantity),
    selection: {
      variantId:
        value.selection.variantId === undefined
          ? undefined
          : requireIdentifier(value.selection.variantId),
      addonOptionIdsByGroupId,
    },
  };
}

function buildOrderItemSnapshots(
  requestedItems: CreateOrderInput["items"],
  menu: MenuState,
) {
  return requestedItems.map((requested) => {
    const item = menu.menuItems.find((candidate) => candidate.id === requested.productId);
    if (!item || !isOrderable(menu, item)) {
      invalid("Позиция заказа недоступна.", "INVALID_PRODUCT");
    }
    return buildOrderItemSnapshot(menu, item, requested.selection, requested.quantity);
  });
}

function buildOrderItemSnapshot(
  menu: MenuState,
  item: MenuItem,
  selection: MenuSelection,
  quantity: number,
): ServerOrderItem {
  const activeVariants = item.variants.filter((variant) => variant.isActive);
  const variant = activeVariants.find((candidate) => candidate.id === selection.variantId);
  if ((activeVariants.length > 0 && !variant) || (activeVariants.length === 0 && selection.variantId)) {
    invalid("Некорректный вариант позиции.", "INVALID_VARIANT");
  }

  const groups = item.addonGroupIds
    .map((id) => menu.addonGroups.find((group) => group.id === id && group.isActive))
    .filter((group): group is AddonGroup => Boolean(group));
  const allowedGroupIds = new Set(groups.map((group) => group.id));
  if (Object.keys(selection.addonOptionIdsByGroupId).some((id) => !allowedGroupIds.has(id))) {
    invalid("Позиция содержит неизвестную группу модификаторов.", "INVALID_MODIFIER_GROUP");
  }

  const modifiers: string[] = [];
  let unitPriceMinor = toMinor(item.basePrice);
  for (const group of groups) {
    const selectedIds = selection.addonOptionIdsByGroupId[group.id] ?? [];
    const uniqueIds = new Set(selectedIds);
    if (uniqueIds.size !== selectedIds.length || (group.selectionType === "single" && selectedIds.length > 1)) {
      invalid("Некорректный выбор модификаторов.", "INVALID_MODIFIERS");
    }
    if (group.required && selectedIds.length === 0) {
      invalid("Не выбран обязательный модификатор.", "REQUIRED_MODIFIER_MISSING");
    }
    for (const selectedId of selectedIds) {
      const option = group.options.find((candidate) => candidate.id === selectedId && candidate.isActive);
      if (!option) invalid("Неизвестный модификатор.", "INVALID_MODIFIER");
      modifiers.push(option.name);
      unitPriceMinor += toMinor(option.priceDelta);
    }
  }
  if (variant) unitPriceMinor += toMinor(variant.priceDelta);

  const category = menu.categories.find((candidate) => candidate.id === item.categoryId);
  return {
    id: item.id,
    name: item.name,
    volume: variant?.name || item.description,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    baristaType:
      item.workingZoneId === "bar" || item.workingZoneId === "cold" ? "drink" : "food",
    categoryId: item.categoryId,
    categoryName: category?.name,
    workingZoneId: item.workingZoneId,
    type: item.kind,
    quantity,
    unitPriceMinor,
    lineTotalMinor: unitPriceMinor * quantity,
  };
}

function assertAvailable(
  snapshots: ServerOrderItem[],
  requestedItems: CreateOrderInput["items"],
  availability: Awaited<ReturnType<typeof getStorefrontAvailability>>,
) {
  const quantities = new Map<string, number>();
  snapshots.forEach((item, index) => {
    increment(quantities, item.id, item.quantity);
    Object.values(requestedItems[index].selection.addonOptionIdsByGroupId)
      .flat()
      .forEach((id) => increment(quantities, id, item.quantity));
  });
  for (const [id, quantity] of quantities) {
    const state = availability.items[id];
    if (state && (!state.available || (state.balance !== null && quantity > state.balance))) {
      throw new OrderServiceError(
        "Одна из позиций больше недоступна. Обновите корзину.",
        409,
        "ITEM_UNAVAILABLE",
      );
    }
  }
}

function isOrderable(menu: MenuState, item: MenuItem) {
  const category = menu.categories.find((candidate) => candidate.id === item.categoryId);
  if (!item.isActive || !item.inStock || category?.isActive !== true) return false;
  if (item.variants.length > 0 && !item.variants.some((variant) => variant.isActive)) {
    return false;
  }

  return item.addonGroupIds.every((groupId) => {
    const group = menu.addonGroups.find(
      (candidate) => candidate.id === groupId && candidate.isActive,
    );
    return !group?.required || group.options.some((option) => option.isActive);
  });
}

function toCustomerOrder(order: ServerOrder): CustomerOrder {
  return {
    id: order.id,
    number: order.number,
    customerName: order.customerName,
    comment: order.comment,
    items: order.items.map(stripServerItemMoney),
    total: order.totalMinor / 100,
    ...(order.payment ? { paymentStatus: order.payment.status } : {}),
    status: order.status,
    source: order.source,
    createdAt: order.createdAt,
    statusChangedAt: order.statusChangedAt,
    completedAt: order.completedAt,
  };
}

function toBaristaOrder(order: ServerOrder): BaristaOrder {
  return {
    ...toCustomerOrder(order),
    phone: order.phone,
    personalDataConsent: true,
    personalDataConsentAt: order.personalDataConsentAt,
    personalDataConsentVersion: order.personalDataConsentVersion,
  };
}

function stripServerItemMoney(item: ServerOrderItem) {
  return {
    id: item.id,
    name: item.name,
    volume: item.volume,
    modifiers: item.modifiers,
    baristaType: item.baristaType,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    workingZoneId: item.workingZoneId,
    type: item.type,
    quantity: item.quantity,
  };
}

function normalizePhone(value: unknown) {
  const phone = normalizeOrderPhone(value);
  if (!phone) {
    invalid("Введите корректный номер телефона.", "INVALID_PHONE");
  }
  return phone;
}

function requireTrimmedString(value: unknown, message: string, maximumLength: number) {
  if (typeof value !== "string") invalid(message, "INVALID_STRING");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumLength) invalid(message, "INVALID_STRING");
  return trimmed;
}

function optionalTrimmedString(value: unknown, maximumLength: number, message: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") invalid(message, "INVALID_COMMENT");
  const trimmed = value.trim();
  if (trimmed.length > maximumLength) invalid(message, "INVALID_COMMENT");
  return trimmed || undefined;
}

function requireIdentifier(value: unknown) {
  if (typeof value !== "string") invalid("Некорректный идентификатор.", "INVALID_IDENTIFIER");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumIdentifierLength) {
    invalid("Некорректный идентификатор.", "INVALID_IDENTIFIER");
  }
  return trimmed;
}

function validateIdempotencyKey(value: string) {
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(value)) {
    invalid("Некорректный Idempotency-Key.", "INVALID_IDEMPOTENCY_KEY");
  }
}

function validateOrderId(value: string) {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new OrderServiceError("Заказ не найден.", 404, "ORDER_NOT_FOUND");
  }
}

function toMinor(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    invalid("Для позиции не настроена корректная цена.", "INVALID_PRICE");
  }
  return Math.round(value * 100);
}

function increment(values: Map<string, number>, id: string, quantity: number) {
  values.set(id, (values.get(id) ?? 0) + quantity);
}

function invalid(message: string, code: string): never {
  throw new OrderServiceError(message, 400, code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapPersistenceError(error: unknown) {
  if (error instanceof OrderServiceError) return error;
  if (error instanceof StorefrontPersistenceError) {
    return new OrderServiceError(
      "Сервис заказов временно недоступен. Попробуйте ещё раз.",
      503,
      "ORDER_STORAGE_UNAVAILABLE",
    );
  }
  return new OrderServiceError(
    "Не удалось сохранить заказ. Попробуйте ещё раз.",
    503,
    "ORDER_STORAGE_ERROR",
  );
}
