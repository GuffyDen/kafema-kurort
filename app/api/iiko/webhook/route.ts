import {
  getIikoWebhookState,
  saveIikoWebhookError,
  saveIikoWebhookEvent,
} from "@/lib/iikoWebhookStore";

export const dynamic = "force-dynamic";

const defaultAppUrl = "https://kafema-kurort.vercel.app";

export async function GET() {
  return Response.json(createWebhookStatus());
}

export async function POST(request: Request) {
  const auth = validateWebhookToken(request);

  if (!auth.ok) {
    saveIikoWebhookError(auth.error);

    return Response.json(
      {
        ok: false,
        error: auth.error,
      },
      { status: 401 },
    );
  }

  const payload = await readJsonPayload(request);

  if (!payload.ok) {
    saveIikoWebhookError(payload.error);

    return Response.json({
      ok: true,
      accepted: true,
      warning: payload.error,
    });
  }

  const snapshot = saveIikoWebhookEvent(payload.data);

  console.info("iiko webhook received", {
    eventType: snapshot.eventType,
    orderId: snapshot.orderId,
    status: snapshot.status,
    timestamp: snapshot.timestamp,
  });

  return Response.json({
    ok: true,
    accepted: true,
    eventType: snapshot.eventType,
    orderId: snapshot.orderId,
    status: snapshot.status,
  });
}

function createWebhookStatus() {
  const state = getIikoWebhookState();
  const tokenConfigured = Boolean(process.env.IIKO_WEBHOOK_TOKEN);
  const appUrl = trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL || defaultAppUrl);

  return {
    status: "ok",
    message: "iiko webhook endpoint is ready",
    webhookUrl: `${appUrl}/api/iiko/webhook`,
    tokenConfigured,
    warning:
      process.env.NODE_ENV === "production" && !tokenConfigured
        ? "IIKO_WEBHOOK_TOKEN is not configured in production"
        : null,
    lastWebhookReceivedAt: state.lastEvent?.receivedAt ?? null,
    lastEventType: state.lastEvent?.eventType ?? null,
    lastOrderId: state.lastEvent?.orderId ?? null,
    lastOrderStatus: state.lastEvent?.status ?? null,
    lastError: state.lastError,
    ...(process.env.NODE_ENV !== "production" && state.lastEvent?.rawPayload
      ? { rawPayload: state.lastEvent.rawPayload }
      : {}),
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

async function readJsonPayload(request: Request) {
  try {
    const text = await request.text();
    if (!text.trim()) return { ok: true as const, data: {} };
    return { ok: true as const, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false as const,
      error: "Invalid JSON payload",
    };
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}
