import {
  clearIikoWebhookJournal,
  getIikoWebhookState,
} from "@/lib/iikoWebhookStore";

export const dynamic = "force-dynamic";

const defaultAppUrl = "https://kafema-kurort.vercel.app";

export async function GET() {
  return Response.json(createMonitorStatus());
}

export async function DELETE() {
  clearIikoWebhookJournal();

  return Response.json({
    ok: true,
    cleared: true,
    totalReceived: 0,
  });
}

function createMonitorStatus() {
  const state = getIikoWebhookState();
  const tokenConfigured = Boolean(process.env.IIKO_WEBHOOK_TOKEN);
  const appUrl = trimTrailingSlash(process.env.NEXT_PUBLIC_APP_URL || defaultAppUrl);
  const lastAttempt = state.lastAttempt;

  return {
    status: "ok",
    message: "iiko webhook monitor is ready",
    webhookUrl: `${appUrl}/api/iiko/webhook`,
    tokenConfigured,
    warning:
      process.env.NODE_ENV === "production" && !tokenConfigured
        ? "IIKO_WEBHOOK_TOKEN is not configured in production"
        : null,
    totalReceived: state.totalReceived,
    lastWebhookReceivedAt: state.lastEvent?.receivedAt ?? null,
    lastEventType: state.lastEvent?.eventType ?? null,
    lastOrderId: state.lastEvent?.orderId ?? null,
    lastOrderStatus: state.lastEvent?.status ?? null,
    lastHttpStatus: lastAttempt
      ? formatHttpStatus(lastAttempt.httpStatus, lastAttempt.httpStatusText)
      : null,
    lastClientIp: lastAttempt?.clientIp ?? null,
    lastError: state.lastError,
    lastPayload: state.lastEvent?.rawPayload ?? null,
    lastMessage: state.lastEvent ?? null,
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function formatHttpStatus(status: number, statusText: string) {
  return `${status}${statusText ? ` ${statusText}` : ""}`;
}
