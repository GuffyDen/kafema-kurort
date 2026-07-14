export type IikoWebhookOrderEvent = {
  source: "IIKO";
  status: "NEW";
  iikoOrderId: string | null;
};

export type IikoWebhookRequestLog = {
  id: string;
  receivedAt: string;
  method: string;
  path: string;
  clientIp: string | null;
  userAgent: string | null;
  contentType: string | null;
  hasAuthorization: boolean;
  hasHeaderToken: boolean;
  hasQueryToken: boolean;
  httpStatus: number;
  httpStatusText: string;
  success: boolean;
  error: string | null;
  eventType: string | null;
  orderId: string | null;
  posId: string | null;
  orderStatus: string | null;
  terminalGroupId: string | null;
  organizationId: string | null;
  correlationId: string | null;
  rawBody: string | null;
  parsedJson: unknown | null;
  headers: Record<string, string | boolean | null>;
};

export type IikoWebhookSnapshot = {
  receivedAt: string;
  eventType: string;
  orderId: string | null;
  posId: string | null;
  status: string | null;
  terminalGroupId: string | null;
  organizationId: string | null;
  correlationId: string | null;
  timestamp: string;
  httpStatus: number;
  httpStatusText: string;
  clientIp: string | null;
  orderEvent: IikoWebhookOrderEvent | null;
  rawPayload: unknown;
};

export type IikoWebhookOrderItemSummary = {
  productId: string | null;
  name: string | null;
  amount: number | null;
};

export type IikoWebhookExtractedEvent = {
  eventType: string | null;
  source: "IIKO";
  orderId: string | null;
  posId: string | null;
  orderStatus: string | null;
  terminalGroupId: string | null;
  organizationId: string | null;
  correlationId: string | null;
  itemsCount: number;
  items: IikoWebhookOrderItemSummary[];
};

export type IikoWebhookAttempt = {
  receivedAt: string;
  httpStatus: number;
  httpStatusText: string;
  clientIp: string | null;
  error: string | null;
};

export type IikoWebhookState = {
  lastEvent: IikoWebhookSnapshot | null;
  lastError: string | null;
  lastAttempt: IikoWebhookAttempt | null;
  totalReceived: number;
  totalRequests: number;
  totalErrors: number;
  events: IikoWebhookSnapshot[];
  requests: IikoWebhookRequestLog[];
};

export type SaveIikoWebhookRequestInput = Omit<IikoWebhookRequestLog, "id" | "receivedAt">;

const webhookState: IikoWebhookState = {
  lastEvent: null,
  lastError: null,
  lastAttempt: null,
  totalReceived: 0,
  totalRequests: 0,
  totalErrors: 0,
  events: [],
  requests: [],
};

export function getIikoWebhookState() {
  return webhookState;
}

export function saveIikoWebhookRequest(input: SaveIikoWebhookRequestInput) {
  const receivedAt = new Date().toISOString();
  const requestLog: IikoWebhookRequestLog = {
    ...input,
    id: `iiko-webhook-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    receivedAt,
  };

  webhookState.totalRequests += 1;
  if (!requestLog.success) {
    webhookState.totalErrors += 1;
    webhookState.lastError = requestLog.error;
  } else {
    webhookState.lastError = null;
  }
  webhookState.lastAttempt = {
    receivedAt,
    httpStatus: requestLog.httpStatus,
    httpStatusText: requestLog.httpStatusText,
    clientIp: requestLog.clientIp,
    error: requestLog.error,
  };
  webhookState.requests = [requestLog, ...webhookState.requests].slice(0, 100);

  if (requestLog.success) {
    saveSuccessfulWebhookEvent(requestLog, receivedAt);
  }

  return requestLog;
}

export function clearIikoWebhookJournal() {
  webhookState.lastEvent = null;
  webhookState.lastError = null;
  webhookState.lastAttempt = null;
  webhookState.totalReceived = 0;
  webhookState.totalRequests = 0;
  webhookState.totalErrors = 0;
  webhookState.events = [];
  webhookState.requests = [];
}

function saveSuccessfulWebhookEvent(
  requestLog: IikoWebhookRequestLog,
  receivedAt: string,
) {
  const payload = requestLog.parsedJson ?? {};
  const eventType =
    requestLog.eventType ?? extractString(payload, ["eventType", "type", "event.type"]) ?? "unknown";
  const orderId =
    requestLog.orderId ??
    extractString(payload, ["orderId", "id", "order.id", "order.orderId"]) ??
    null;
  const status =
    requestLog.orderStatus ??
    extractString(payload, ["status", "order.status", "order.orderStatus"]) ??
    null;
  const timestamp =
    extractString(payload, ["timestamp", "eventTime", "time", "createdAt"]) ??
    receivedAt;
  const snapshot: IikoWebhookSnapshot = {
    receivedAt,
    eventType,
    orderId,
    posId: requestLog.posId,
    status,
    terminalGroupId: requestLog.terminalGroupId,
    organizationId: requestLog.organizationId,
    correlationId: requestLog.correlationId,
    timestamp,
    httpStatus: requestLog.httpStatus,
    httpStatusText: requestLog.httpStatusText,
    clientIp: requestLog.clientIp,
    orderEvent: orderId
      ? {
          source: "IIKO",
          status: "NEW",
          iikoOrderId: orderId,
        }
      : null,
    rawPayload: payload,
  };

  webhookState.lastEvent = snapshot;
  webhookState.totalReceived += 1;
  webhookState.events = [snapshot, ...webhookState.events].slice(0, 50);

  return snapshot;
}

export function extractIikoWebhookFields(payload: unknown) {
  const events = extractIikoWebhookEvents(payload);
  const event = events.find((item) => item.orderId) ?? events[0];

  return {
    eventType: event?.eventType ?? null,
    orderId: event?.orderId ?? null,
    posId: event?.posId ?? null,
    orderStatus: event?.orderStatus ?? null,
    terminalGroupId: event?.terminalGroupId ?? null,
    organizationId: event?.organizationId ?? null,
    correlationId: event?.correlationId ?? null,
  };
}

export function extractIikoWebhookEvents(
  payload: unknown,
): IikoWebhookExtractedEvent[] {
  const payloads = Array.isArray(payload) ? payload : [payload];

  return payloads
    .filter(isRecord)
    .map((event) => {
      const items = extractOrderItems(event);

      return {
        eventType:
          extractString(event, ["eventType", "type", "event.type"]) ?? null,
        source: "IIKO" as const,
        orderId:
          extractString(event, [
            "eventInfo.id",
            "orderId",
            "id",
            "order.id",
            "order.orderId",
          ]) ?? null,
        posId:
          extractString(event, [
            "eventInfo.posId",
            "posId",
            "order.posId",
          ]) ?? null,
        orderStatus:
          extractString(event, [
            "eventInfo.order.status",
            "status",
            "order.status",
            "order.orderStatus",
          ]) ?? null,
        terminalGroupId:
          extractString(event, [
            "eventInfo.order.terminalGroupId",
            "terminalGroupId",
            "order.terminalGroupId",
          ]) ?? null,
        organizationId:
          extractString(event, [
            "organizationId",
            "eventInfo.organizationId",
            "order.organizationId",
          ]) ?? null,
        correlationId:
          extractString(event, ["correlationId", "eventInfo.correlationId"]) ??
          null,
        itemsCount: items.length,
        items,
      };
    });
}

function extractString(payload: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getValueByPath(payload, path);
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }

  return null;
}

function getValueByPath(payload: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, payload);
}

function extractOrderItems(payload: unknown): IikoWebhookOrderItemSummary[] {
  const items = [
    "eventInfo.order.items",
    "order.items",
    "items",
  ]
    .map((path) => getValueByPath(payload, path))
    .find(Array.isArray);

  if (!items) return [];

  return items.filter(isRecord).flatMap((item) => {
    const products = [
      getValueByPath(item, "product"),
      getValueByPath(item, "primaryComponent.product"),
      getValueByPath(item, "secondaryComponent.product"),
    ].filter(isRecord);

    if (products.length === 0) {
      const productId = extractString(item, ["productId"]);
      const name = extractString(item, ["name", "productName"]);

      return productId || name
        ? [{ productId: productId ?? null, name: name ?? null, amount: extractNumber(item, "amount") }]
        : [];
    }

    return products.map((product) => ({
      productId: extractString(product, ["id"]) ?? null,
      name: extractString(product, ["name"]) ?? null,
      amount: extractNumber(item, "amount"),
    }));
  });
}

function extractNumber(payload: unknown, path: string) {
  const value = getValueByPath(payload, path);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
