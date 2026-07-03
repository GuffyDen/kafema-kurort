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
  httpStatus: number;
  httpStatusText: string;
  clientIp: string | null;
  orderEvent: IikoWebhookOrderEvent | null;
  rawPayload: unknown;
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
  events: IikoWebhookSnapshot[];
};

const webhookState: IikoWebhookState = {
  lastEvent: null,
  lastError: null,
  lastAttempt: null,
  totalReceived: 0,
  events: [],
};

export function getIikoWebhookState() {
  return webhookState;
}

export function saveIikoWebhookEvent(
  payload: unknown,
  meta: {
    httpStatus: number;
    httpStatusText: string;
    clientIp: string | null;
  },
) {
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
    httpStatus: meta.httpStatus,
    httpStatusText: meta.httpStatusText,
    clientIp: meta.clientIp,
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
  webhookState.lastError = null;
  webhookState.lastAttempt = {
    receivedAt: snapshot.receivedAt,
    httpStatus: meta.httpStatus,
    httpStatusText: meta.httpStatusText,
    clientIp: meta.clientIp,
    error: null,
  };
  webhookState.totalReceived += 1;
  webhookState.events = [snapshot, ...webhookState.events].slice(0, 50);

  return snapshot;
}

export function saveIikoWebhookError(
  error: string,
  meta?: {
    httpStatus: number;
    httpStatusText: string;
    clientIp: string | null;
  },
) {
  webhookState.lastError = error;
  if (meta) {
    webhookState.lastAttempt = {
      receivedAt: new Date().toISOString(),
      httpStatus: meta.httpStatus,
      httpStatusText: meta.httpStatusText,
      clientIp: meta.clientIp,
      error,
    };
  }
}

export function clearIikoWebhookJournal() {
  webhookState.lastEvent = null;
  webhookState.lastError = null;
  webhookState.lastAttempt = null;
  webhookState.totalReceived = 0;
  webhookState.events = [];
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
