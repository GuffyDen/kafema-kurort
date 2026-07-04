import {
  extractIikoWebhookFields,
  getIikoWebhookState,
  saveIikoWebhookRequest,
} from "@/lib/iikoWebhookStore";

export const dynamic = "force-dynamic";

const defaultAppUrl = "https://kafema-kurort.vercel.app";

export async function GET(request: Request) {
  const responseBody = createWebhookStatus();
  saveRequestLog(request, {
    error: null,
    httpStatus: 200,
    httpStatusText: "OK",
    parsedJson: null,
    rawBody: null,
    success: false,
  });

  return Response.json(responseBody);
}

export async function HEAD(request: Request) {
  saveRequestLog(request, {
    error: null,
    httpStatus: 200,
    httpStatusText: "OK",
    parsedJson: null,
    rawBody: null,
    success: false,
  });

  return new Response(null, { status: 200 });
}

export async function OPTIONS(request: Request) {
  saveRequestLog(request, {
    error: null,
    httpStatus: 200,
    httpStatusText: "OK",
    parsedJson: null,
    rawBody: null,
    success: false,
  });

  return new Response(null, {
    headers: {
      Allow: "GET, HEAD, OPTIONS, POST",
    },
    status: 200,
  });
}

export async function POST(request: Request) {
  const rawBody = await readRawBody(request);
  const parsedPayload = parseJsonPayload(rawBody);
  const auth = validateWebhookToken(request);

  if (!auth.ok) {
    saveRequestLog(request, {
      error: auth.error,
      httpStatus: 401,
      httpStatusText: "Unauthorized",
      parsedJson: parsedPayload.ok ? parsedPayload.data : null,
      rawBody,
      success: false,
    });

    return Response.json(
      {
        ok: false,
        error: auth.error,
      },
      { status: 401 },
    );
  }

  if (!parsedPayload.ok) {
    saveRequestLog(request, {
      error: parsedPayload.error,
      httpStatus: 400,
      httpStatusText: "Bad Request",
      parsedJson: null,
      rawBody,
      success: false,
    });

    return Response.json(
      {
        ok: false,
        error: parsedPayload.error,
      },
      { status: 400 },
    );
  }

  const requestLog = saveRequestLog(request, {
    error: null,
    httpStatus: 200,
    httpStatusText: "OK",
    parsedJson: parsedPayload.data,
    rawBody,
    success: true,
  });

  console.info("iiko webhook received", {
    eventType: requestLog.eventType,
    orderId: requestLog.orderId,
    status: requestLog.orderStatus,
    timestamp: requestLog.receivedAt,
  });

  return Response.json({
    ok: true,
    accepted: true,
    eventType: requestLog.eventType,
    orderId: requestLog.orderId,
    status: requestLog.orderStatus,
  });
}

function saveRequestLog(
  request: Request,
  result: {
    error: string | null;
    httpStatus: number;
    httpStatusText: string;
    parsedJson: unknown | null;
    rawBody: string | null;
    success: boolean;
  },
) {
  const url = new URL(request.url);
  const fields = result.parsedJson
    ? extractIikoWebhookFields(result.parsedJson)
    : { eventType: null, orderId: null, orderStatus: null };

  return saveIikoWebhookRequest({
    clientIp: getClientIp(request),
    contentType: request.headers.get("content-type"),
    error: result.error,
    eventType: fields.eventType,
    hasAuthorization: Boolean(request.headers.get("authorization")),
    hasHeaderToken: Boolean(request.headers.get("x-iiko-webhook-token")),
    hasQueryToken: Boolean(url.searchParams.get("token")),
    headers: getSafeHeaders(request),
    httpStatus: result.httpStatus,
    httpStatusText: result.httpStatusText,
    method: request.method,
    orderId: fields.orderId,
    orderStatus: fields.orderStatus,
    parsedJson: result.parsedJson,
    path: url.pathname,
    rawBody: result.rawBody,
    success: result.success,
    userAgent: request.headers.get("user-agent"),
  });
}

function createWebhookStatus() {
  const state = getIikoWebhookState();
  const tokenConfigured = Boolean(process.env.IIKO_WEBHOOK_TOKEN);
  const appUrl = trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL || defaultAppUrl);
  const lastAttempt = state.lastAttempt;

  return {
    status: "ok",
    message: "iiko webhook endpoint is ready",
    webhookUrl: `${appUrl}/api/iiko/webhook`,
    tokenConfigured,
    warning:
      process.env.NODE_ENV === "production" && !tokenConfigured
        ? "IIKO_WEBHOOK_TOKEN is not configured in production"
        : null,
    totalRequests: state.totalRequests,
    totalReceived: state.totalReceived,
    totalErrors: state.totalErrors,
    lastWebhookReceivedAt: state.lastEvent?.receivedAt ?? null,
    lastEventType: state.lastEvent?.eventType ?? null,
    lastOrderId: state.lastEvent?.orderId ?? null,
    lastOrderStatus: state.lastEvent?.status ?? null,
    lastHttpStatus: lastAttempt
      ? formatHttpStatus(lastAttempt.httpStatus, lastAttempt.httpStatusText)
      : null,
    lastClientIp: lastAttempt?.clientIp ?? null,
    lastError: state.lastError,
  };
}

function validateWebhookToken(request: Request) {
  const expectedToken = process.env.IIKO_WEBHOOK_TOKEN;

  if (!expectedToken) {
    return { ok: true as const };
  }

  const url = new URL(request.url);
  const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerToken = request.headers.get("x-iiko-webhook-token");
  const queryToken = url.searchParams.get("token");
  const providedToken = bearerToken || headerToken || queryToken;

  if (providedToken === expectedToken) {
    return { ok: true as const };
  }

  return {
    ok: false as const,
    error: "Invalid iiko webhook token",
  };
}

async function readRawBody(request: Request) {
  try {
    return await request.text();
  } catch {
    return "";
  }
}

function parseJsonPayload(text: string) {
  try {
    if (!text.trim()) return { ok: true as const, data: {} };
    return { ok: true as const, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false as const,
      error: "Invalid JSON payload",
    };
  }
}

function getSafeHeaders(request: Request) {
  return {
    authorizationPresent: Boolean(request.headers.get("authorization")),
    contentType: request.headers.get("content-type"),
    userAgent: request.headers.get("user-agent"),
    xForwardedFor: request.headers.get("x-forwarded-for"),
    xIikoWebhookTokenPresent: Boolean(request.headers.get("x-iiko-webhook-token")),
    xRealIp: request.headers.get("x-real-ip"),
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return (
    forwardedFor ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    null
  );
}

function formatHttpStatus(status: number, statusText: string) {
  return `${status}${statusText ? ` ${statusText}` : ""}`;
}
