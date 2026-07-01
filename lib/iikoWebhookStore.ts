export type IikoWebhookOrderEvent = {
  source: "IIKO";
  status: "NEW";
  iikoOrderId: string | null;
};

export type IikoWebhookSnapshot = {
  receivedAt: string;
  eventType: string;
  orderId: string | null;
  status: string | null;
  timestamp: string;
  orderEvent: IikoWebhookOrderEvent | null;
  rawPayload?: unknown;
};

export type IikoWebhookState = {
  lastEvent: IikoWebhookSnapshot | null;
  lastError: string | null;
};

const webhookState: IikoWebhookState = {
  lastEvent: null,
  lastError: null,
};

export function getIikoWebhookState() {
  return webhookState;
}

export function saveIikoWebhookEvent(payload: unknown) {
  const eventType = extractString(payload, ["eventType", "type", "event.type"]) ?? "unknown";
  const orderId =
    extractString(payload, ["orderId", "id", "order.id", "order.orderId"]) ?? null;
  const status =
    extractString(payload, ["status", "order.status", "order.orderStatus"]) ?? null;
  const timestamp =
    extractString(payload, ["timestamp", "eventTime", "time", "createdAt"]) ??
    new Date().toISOString();
  const snapshot: IikoWebhookSnapshot = {
    receivedAt: new Date().toISOString(),
    eventType,
    orderId,
    status,
    timestamp,
    orderEvent: orderId
      ? {
          source: "IIKO",
          status: "NEW",
          iikoOrderId: orderId,
        }
      : null,
    ...(process.env.NODE_ENV !== "production" ? { rawPayload: payload } : {}),
  };

  webhookState.lastEvent = snapshot;
  webhookState.lastError = null;

  return snapshot;
}

export function saveIikoWebhookError(error: string) {
  webhookState.lastError = error;
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
