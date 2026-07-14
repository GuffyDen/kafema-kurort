import {
  extractIikoWebhookFields,
  getIikoWebhookState,
  saveIikoWebhookRequest,
  type IikoWebhookRequestLog,
} from "@/lib/iikoWebhookStore";
import { saveIikoWebhookAcceptanceLog } from "@/lib/iikoWebhookAcceptanceLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const requestLog = saveRequestLog(request, {
      error: auth.error,
      httpStatus: 401,
      httpStatusText: "Unauthorized",
      parsedJson: parsedPayload.ok ? parsedPayload.data : null,
      rawBody,
      success: false,
    });
    await persistAcceptanceLog(requestLog);

    return Response.json(
      {
        ok: false,
        error: auth.error,
      },
      { status: 401 },
    );
  }

  if (!parsedPayload.ok) {
    const requestLog = saveRequestLog(request, {
      error: parsedPayload.error,
      httpStatus: 400,
      httpStatusText: "Bad Request",
      parsedJson: null,
      rawBody,
      success: false,
    });
    await persistAcceptanceLog(requestLog);

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
  await persistAcceptanceLog(requestLog);

  console.info("iiko webhook received", {
    eventType: requestLog.eventType,
    orderId: requestLog.orderId,
    posId: requestLog.posId,
    status: requestLog.orderStatus,
    terminalGroupId: requestLog.terminalGroupId,
    organizationId: requestLog.organizationId,
    correlationId: requestLog.correlationId,
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
    : {
        eventType: null,
        orderId: null,
        posId: null,
        orderStatus: null,
        terminalGroupId: null,
        organizationId: null,
        correlationId: null,
      };

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
    posId: fields.posId,
    orderStatus: fields.orderStatus,
    terminalGroupId: fields.terminalGroupId,
    organizationId: fields.organizationId,
    correlationId: fields.correlationId,
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
    lastPosId: state.lastEvent?.posId ?? null,
    lastOrderStatus: state.lastEvent?.status ?? null,
    lastTerminalGroupId: state.lastEvent?.terminalGroupId ?? null,
    lastOrganizationId: state.lastEvent?.organizationId ?? null,
    lastCorrelationId: state.lastEvent?.correlationId ?? null,
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
  const headers: Record<string, string> = {};

  request.headers.forEach((value, key) => {
    headers[key] = isSensitiveHeader(key) ? "<redacted>" : value;
  });

  return headers;
}

function isSensitiveHeader(name: string) {
  return /authorization|token|secret|api[-_]?key|cookie/i.test(name);
}

async function persistAcceptanceLog(requestLog: IikoWebhookRequestLog) {
  // Vercel runtime logs are the fallback if its ephemeral filesystem is recycled.
  console.info("iiko webhook acceptance request", JSON.stringify(requestLog));

  try {
    await saveIikoWebhookAcceptanceLog(requestLog);
  } catch (error) {
    console.error("iiko webhook acceptance file write failed", {
      message: error instanceof Error ? error.message : String(error),
      requestId: requestLog.id,
    });
  }
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
