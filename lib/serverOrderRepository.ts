import { createHash } from "node:crypto";
import {
  readStorefrontJson,
  writeStorefrontJson,
  executeRedisCommand,
  getStorefrontPersistence,
  StorefrontPersistenceError,
} from "@/lib/storefrontStorage";
import type { OrderFiscal, ReceiptRegistration, ServerOrder } from "@/lib/orderTypes";

type IdempotencyRecord = {
  orderId: string;
  accessToken: string;
  expiresAt: number;
};

type LocalOrdersDocument = {
  version: 1;
  orders: Record<string, ServerOrder>;
  orderIds: string[];
  activeNumbers: Record<string, string>;
  idempotency: Record<string, IdempotencyRecord>;
};

export type CreatePersistedOrderResult =
  | { kind: "created"; order: ServerOrder; accessToken: string }
  | { kind: "idempotent"; order: ServerOrder; accessToken: string }
  | { kind: "number-conflict" };

const idempotencyTtlSeconds = 10 * 60;
let localWriteQueue = Promise.resolve();

export async function createPersistedOrder(input: {
  order: ServerOrder;
  accessToken: string;
  idempotencyKey: string;
}): Promise<CreatePersistedOrderResult> {
  const persistence = getStorefrontPersistence();

  if (!persistence.writable) {
    throw new StorefrontPersistenceError(
      persistence.warning ?? "Постоянное хранилище заказов не настроено.",
    );
  }

  if (persistence.mode === "redis") {
    return createRedisOrder(input);
  }

  return withLocalWrite(async () => {
    const storage = getOrderStorage(input.order.tenantId);
    const stored = await readStorefrontJson<LocalOrdersDocument>(
      storage.documentKey,
      storage.localFileName,
    );
    const document = normalizeLocalDocument(stored.value);
    const now = Date.now();
    removeExpiredIdempotency(document, now);
    const previous = document.idempotency[input.idempotencyKey];

    if (previous) {
      const order = document.orders[previous.orderId];
      if (order) {
        return {
          kind: "idempotent" as const,
          order,
          accessToken: previous.accessToken,
        };
      }
    }

    if (document.activeNumbers[input.order.number]) {
      return { kind: "number-conflict" as const };
    }

    document.orders[input.order.id] = input.order;
    document.orderIds.push(input.order.id);
    document.activeNumbers[input.order.number] = input.order.id;
    document.idempotency[input.idempotencyKey] = {
      orderId: input.order.id,
      accessToken: input.accessToken,
      expiresAt: now + idempotencyTtlSeconds * 1000,
    };
    await writeStorefrontJson(
      storage.documentKey,
      storage.localFileName,
      document,
    );

    return { kind: "created" as const, ...input };
  });
}

export async function getPersistedOrder(tenantId: string, orderId: string) {
  const persistence = getStorefrontPersistence();
  assertReadablePersistence(persistence.writable, persistence.warning);
  const storage = getOrderStorage(tenantId);

  if (persistence.mode === "redis") {
    const result = await executeRedisCommand(["GET", orderKey(storage, orderId)]);
    return parseOrder(result);
  }

  const stored = await readStorefrontJson<LocalOrdersDocument>(
    storage.documentKey,
    storage.localFileName,
  );
  return normalizeLocalDocument(stored.value).orders[orderId] ?? null;
}

export async function listPersistedOrders(tenantId: string, limit = 500) {
  const persistence = getStorefrontPersistence();
  assertReadablePersistence(persistence.writable, persistence.warning);
  const storage = getOrderStorage(tenantId);

  if (persistence.mode === "redis") {
    const idsResult = await executeRedisCommand([
      "ZREVRANGE",
      storage.indexKey,
      "0",
      String(Math.max(0, limit - 1)),
    ]);
    const ids = Array.isArray(idsResult)
      ? idsResult.filter((id): id is string => typeof id === "string")
      : [];
    if (ids.length === 0) return [];
    const values = await executeRedisCommand([
      "MGET",
      ...ids.map((id) => orderKey(storage, id)),
    ]);
    return (Array.isArray(values) ? values : [])
      .map(parseOrder)
      .filter((order): order is ServerOrder => order !== null)
      .sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt));
  }

  const stored = await readStorefrontJson<LocalOrdersDocument>(
    storage.documentKey,
    storage.localFileName,
  );
  const document = normalizeLocalDocument(stored.value);
  return document.orderIds
    .slice(-limit)
    .map((id) => document.orders[id])
    .filter((order): order is ServerOrder => Boolean(order));
}

export async function updatePersistedOrderStatus(input: {
  tenantId: string;
  orderId: string;
  expectedStatus: ServerOrder["status"];
  order: ServerOrder;
}) {
  const persistence = getStorefrontPersistence();
  assertReadablePersistence(persistence.writable, persistence.warning);

  if (persistence.mode === "redis") {
    return updateRedisOrderStatus(input);
  }

  return withLocalWrite(async () => {
    const storage = getOrderStorage(input.tenantId);
    const stored = await readStorefrontJson<LocalOrdersDocument>(
      storage.documentKey,
      storage.localFileName,
    );
    const document = normalizeLocalDocument(stored.value);
    const current = document.orders[input.orderId];

    if (!current || current.status !== input.expectedStatus) return null;
    const updated = { ...input.order, payment: current.payment, fiscal: current.fiscal };
    if (input.order.status === "completed" && input.order.fiscal?.settlement && !current.fiscal?.settlement) {
      updated.fiscal = { ...input.order.fiscal, prepayment: current.fiscal?.prepayment ?? { status: "unknown" },
        revision: (current.fiscal?.revision ?? 0) + 1 };
    }
    document.orders[input.orderId] = updated;
    if (input.order.status === "completed") {
      delete document.activeNumbers[input.order.number];
    }
    await writeStorefrontJson(
      storage.documentKey,
      storage.localFileName,
      document,
    );
    return updated;
  });
}

async function createRedisOrder({
  order,
  accessToken,
  idempotencyKey,
}: {
  order: ServerOrder;
  accessToken: string;
  idempotencyKey: string;
}): Promise<CreatePersistedOrderResult> {
  const storage = getOrderStorage(order.tenantId);
  const idempotencyValue = JSON.stringify({ orderId: order.id, accessToken });
  const script = [
    "local previous = redis.call('GET', KEYS[4])",
    "if previous then return {'IDEMPOTENT', previous} end",
    "if redis.call('EXISTS', KEYS[3]) == 1 then return {'NUMBER_CONFLICT'} end",
    "redis.call('SET', KEYS[1], ARGV[1])",
    "redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])",
    "redis.call('SET', KEYS[3], ARGV[3])",
    "redis.call('SET', KEYS[4], ARGV[4], 'EX', ARGV[5])",
    "return {'CREATED'}",
  ].join("\n");
  const result = await executeRedisCommand([
    "EVAL",
    script,
    "4",
    orderKey(storage, order.id),
    storage.indexKey,
    numberKey(storage, order.number),
    idempotencyKeyFor(storage, idempotencyKey),
    JSON.stringify(order),
    String(Date.parse(order.createdAt)),
    order.id,
    idempotencyValue,
    String(idempotencyTtlSeconds),
  ]);

  if (!Array.isArray(result) || typeof result[0] !== "string") {
    throw new StorefrontPersistenceError("Redis вернул некорректный ответ при создании заказа.");
  }
  if (result[0] === "NUMBER_CONFLICT") return { kind: "number-conflict" };
  if (result[0] === "IDEMPOTENT" && typeof result[1] === "string") {
    const previous = parseIdempotency(result[1]);
    if (!previous) {
      throw new StorefrontPersistenceError("Redis вернул некорректный idempotency record.");
    }
    const previousOrder = await getPersistedOrder(order.tenantId, previous.orderId);
    if (!previousOrder) {
      throw new StorefrontPersistenceError("Idempotent order не найден в хранилище.");
    }
    return { kind: "idempotent", order: previousOrder, accessToken: previous.accessToken };
  }
  return { kind: "created", order, accessToken };
}

async function updateRedisOrderStatus(input: {
  tenantId: string;
  orderId: string;
  expectedStatus: ServerOrder["status"];
  order: ServerOrder;
}) {
  const storage = getOrderStorage(input.tenantId);
  const script = [
    "local raw = redis.call('GET', KEYS[1])",
    "if not raw then return {'NOT_FOUND'} end",
    "local current = cjson.decode(raw)",
    "if current.status ~= ARGV[1] then return {'CONFLICT'} end",
    "local updated = cjson.decode(ARGV[2])",
    "updated.payment = current.payment",
    "local planned = updated.fiscal",
    "updated.fiscal = current.fiscal",
    "if ARGV[3] == 'completed' and planned and planned.settlement and (not current.fiscal or not current.fiscal.settlement) then",
    "  updated.fiscal = planned",
    "  updated.fiscal.revision = (current.fiscal and current.fiscal.revision or 0) + 1",
    "  if current.fiscal then updated.fiscal.prepayment = current.fiscal.prepayment end",
    "  if updated.fiscal.nextAttemptAt then redis.call('ZADD', KEYS[3], updated.fiscal.nextAttemptAt, updated.id) end",
    "  if updated.fiscal.settlement.state == 'needs_review' then redis.call('SADD', KEYS[4], updated.id) end",
    "end",
    "redis.call('SET', KEYS[1], cjson.encode(updated))",
    "if ARGV[3] == 'completed' then redis.call('DEL', KEYS[2]) end",
    "return {'UPDATED', cjson.encode(updated)}",
  ].join("\n");
  const result = await executeRedisCommand([
    "EVAL",
    script,
    "4",
    orderKey(storage, input.orderId),
    numberKey(storage, input.order.number),
    storage.fiscalQueueKey,
    storage.fiscalIssuesKey,
    input.expectedStatus,
    JSON.stringify(input.order),
    input.order.status,
  ]);
  return Array.isArray(result) && result[0] === "UPDATED" ? parseOrder(result[1]) : null;
}

function getOrderStorage(tenantId: string) {
  const namespace = `tablo:tenant:${encodeURIComponent(tenantId)}:orders:v1`;
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const tenantHash = createHash("sha256").update(tenantId).digest("hex").slice(0, 12);
  return {
    namespace,
    indexKey: `${namespace}:index`,
    fiscalQueueKey: `${namespace}:fiscal-pending`,
    fiscalIssuesKey: `${namespace}:fiscal-issues`,
    documentKey: `${namespace}:document`,
    localFileName: `orders-${safeTenantId}-${tenantHash}.json`,
  };
}

function orderKey(storage: ReturnType<typeof getOrderStorage>, orderId: string) {
  return `${storage.namespace}:order:${orderId}`;
}

function numberKey(storage: ReturnType<typeof getOrderStorage>, number: string) {
  return `${storage.namespace}:active-number:${number}`;
}

function idempotencyKeyFor(storage: ReturnType<typeof getOrderStorage>, key: string) {
  return `${storage.namespace}:idempotency:${key}`;
}

function normalizeLocalDocument(value: LocalOrdersDocument | null): LocalOrdersDocument {
  return {
    version: 1,
    orders: value?.orders && typeof value.orders === "object" ? value.orders : {},
    orderIds: Array.isArray(value?.orderIds) ? value.orderIds : [],
    activeNumbers:
      value?.activeNumbers && typeof value.activeNumbers === "object"
        ? value.activeNumbers
        : {},
    idempotency:
      value?.idempotency && typeof value.idempotency === "object"
        ? value.idempotency
        : {},
  };
}

function removeExpiredIdempotency(document: LocalOrdersDocument, now: number) {
  Object.entries(document.idempotency).forEach(([key, record]) => {
    if (record.expiresAt <= now) delete document.idempotency[key];
  });
}

function parseOrder(value: unknown): ServerOrder | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as ServerOrder;
  } catch {
    return null;
  }
}

function parseIdempotency(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<IdempotencyRecord>;
    return typeof parsed.orderId === "string" && typeof parsed.accessToken === "string"
      ? { orderId: parsed.orderId, accessToken: parsed.accessToken }
      : null;
  } catch {
    return null;
  }
}

function assertReadablePersistence(writable: boolean, warning: string | null) {
  if (!writable) {
    throw new StorefrontPersistenceError(
      warning ?? "Постоянное хранилище заказов не настроено.",
    );
  }
}

function withLocalWrite<T>(operation: () => Promise<T>) {
  const next = localWriteQueue.then(operation, operation);
  localWriteQueue = next.then(() => undefined, () => undefined);
  return next;
}

// Payment-only compare-and-swap: preserves concurrent fulfilment changes.
export async function updatePersistedOrderPayment(order: ServerOrder, payment: NonNullable<ServerOrder["payment"]>) {
  const persistence = getStorefrontPersistence();
  assertReadablePersistence(persistence.writable, persistence.warning);
  const storage = getOrderStorage(order.tenantId);
  const expectedRevision = order.payment?.revision;
  if (expectedRevision === undefined) return null;
  const nextPayment = { ...payment, revision: expectedRevision + 1 };
  if (persistence.mode === "redis") {
    const script = [
      "local raw = redis.call('GET', KEYS[1])",
      "if not raw then return nil end",
      "local current = cjson.decode(raw)",
      "if not current.payment or current.payment.revision ~= tonumber(ARGV[1]) then return nil end",
      "current.payment = cjson.decode(ARGV[2])",
      "if current.payment.status == 'succeeded' then current.statusChangedAt = current.payment.paidAt end",
      "local result = cjson.encode(current)",
      "redis.call('SET', KEYS[1], result)",
      "return result",
    ].join("\n");
    return parseOrder(await executeRedisCommand(["EVAL", script, "1", orderKey(storage, order.id),
      String(expectedRevision), JSON.stringify(nextPayment)]));
  }
  return withLocalWrite(async () => {
    const stored = await readStorefrontJson<LocalOrdersDocument>(storage.documentKey, storage.localFileName);
    const document = normalizeLocalDocument(stored.value);
    const current = document.orders[order.id];
    if (!current?.payment || current.payment.revision !== expectedRevision) return null;
    const updated = { ...current, payment: nextPayment,
      ...(nextPayment.status === "succeeded" ? { statusChangedAt: nextPayment.paidAt! } : {}) };
    document.orders[order.id] = updated;
    await writeStorefrontJson(storage.documentKey, storage.localFileName, document);
    return updated;
  });
}

// Fiscal CAS and its durable due-time index are one Redis transaction.
export async function updatePersistedOrderFiscal(order: ServerOrder, fiscal: OrderFiscal) {
  const persistence = getStorefrontPersistence();
  assertReadablePersistence(persistence.writable, persistence.warning);
  const storage = getOrderStorage(order.tenantId);
  const expected = order.fiscal?.revision ?? 0;
  const next = JSON.parse(JSON.stringify({ ...fiscal, revision: expected + 1 })) as OrderFiscal;
  if (persistence.mode === "redis") {
    const script = [
      "local raw = redis.call('GET', KEYS[1])",
      "if not raw then return nil end",
      "local current = cjson.decode(raw)",
      "if (current.fiscal and current.fiscal.revision or 0) ~= tonumber(ARGV[1]) then return nil end",
      "current.fiscal = cjson.decode(ARGV[2])",
      "local f = current.fiscal",
      "if f.nextAttemptAt then redis.call('ZADD', KEYS[2], f.nextAttemptAt, current.id) else redis.call('ZREM', KEYS[2], current.id) end",
      "if (f.settlement and f.settlement.state == 'needs_review') or f.prepayment.status == 'canceled' or f.lastError == 'FISCAL_PREPAYMENT_OVERDUE' then",
      "  redis.call('SADD', KEYS[3], current.id)",
      "else redis.call('SREM', KEYS[3], current.id) end",
      "local result = cjson.encode(current)",
      "redis.call('SET', KEYS[1], result)",
      "return result",
    ].join("\n");
    return parseOrder(await executeRedisCommand(["EVAL", script, "3", orderKey(storage, order.id),
      storage.fiscalQueueKey, storage.fiscalIssuesKey, String(expected), JSON.stringify(next)]));
  }
  return withLocalWrite(async () => {
    const stored = await readStorefrontJson<LocalOrdersDocument>(storage.documentKey, storage.localFileName);
    const document = normalizeLocalDocument(stored.value);
    const current = document.orders[order.id];
    if (!current || (current.fiscal?.revision ?? 0) !== expected) return null;
    const updated = { ...current, fiscal: next };
    document.orders[order.id] = updated;
    await writeStorefrontJson(storage.documentKey, storage.localFileName, document);
    return updated;
  });
}

export async function listDueFiscalOrders(tenantId: string, now = Date.now(), limit = 10) {
  const storage = getOrderStorage(tenantId);
  const persistence = getStorefrontPersistence();
  assertReadablePersistence(persistence.writable, persistence.warning);
  if (persistence.mode === "redis") {
    const result = await executeRedisCommand(["ZRANGEBYSCORE", storage.fiscalQueueKey, "-inf", String(now), "LIMIT", "0", String(limit)]);
    return Array.isArray(result) ? result.filter((id): id is string => typeof id === "string") : [];
  }
  const stored = await readStorefrontJson<LocalOrdersDocument>(storage.documentKey, storage.localFileName);
  return Object.values(normalizeLocalDocument(stored.value).orders)
    .filter((order) => order.fiscal?.nextAttemptAt !== undefined && order.fiscal.nextAttemptAt <= now)
    .sort((a, b) => a.fiscal!.nextAttemptAt! - b.fiscal!.nextAttemptAt!)
    .slice(0, limit).map((order) => order.id);
}

export async function getFiscalQueueCounts(tenantId: string) {
  const storage = getOrderStorage(tenantId);
  if (getStorefrontPersistence().mode === "redis") {
    const [pending, needsReview] = await Promise.all([
      executeRedisCommand(["ZCARD", storage.fiscalQueueKey]), executeRedisCommand(["SCARD", storage.fiscalIssuesKey]),
    ]);
    return { pending: Number(pending), needsReview: Number(needsReview) };
  }
  const stored = await readStorefrontJson<LocalOrdersDocument>(storage.documentKey, storage.localFileName);
  const orders = Object.values(normalizeLocalDocument(stored.value).orders);
  return {
    pending: orders.filter((order) => order.fiscal?.nextAttemptAt !== undefined).length,
    needsReview: orders.filter((order) => order.fiscal?.settlement?.state === "needs_review" ||
      order.fiscal?.prepayment.status === "canceled" || order.fiscal?.lastError === "FISCAL_PREPAYMENT_OVERDUE").length,
  };
}

export async function recordPrepaymentRegistration(order: ServerOrder, status: ReceiptRegistration | undefined) {
  if (order.payment?.receiptVersion !== 2 || !order.payment.id) return order;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getPersistedOrder(order.tenantId, order.id);
    if (!current?.fiscal) return order;
    const fiscal = current.fiscal;
    const nextStatus = status ?? "unknown";
    if (fiscal.prepayment.status === nextStatus || ["succeeded", "canceled"].includes(fiscal.prepayment.status)) return current;
    const waiting = nextStatus === "pending" || nextStatus === "unknown";
    const saved = await updatePersistedOrderFiscal(current, { ...fiscal,
      prepayment: { status: nextStatus, updatedAt: new Date().toISOString() },
      nextAttemptAt: fiscal.settlement?.state === "pending" || fiscal.leaseUntil ? fiscal.nextAttemptAt :
        waiting ? Date.now() + 60_000 : undefined,
    });
    if (saved) return saved;
  }
  throw new StorefrontPersistenceError("Не удалось сохранить состояние фискализации.");
}
