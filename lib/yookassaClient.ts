import "server-only";
import type { ReceiptRegistration } from "@/lib/orderTypes";

export class PaymentError extends Error {
  constructor(readonly code: string, readonly status = 503) {
    super("Не удалось подтвердить состояние оплаты. Попробуйте позже.");
  }
}

// Modes are explicit; merely adding credentials must never enable payments.
export type YookassaMode = "test" | "live";
export function getYookassaConfig() {
  const mode = process.env.YOOKASSA_MODE ?? "disabled";
  if (mode === "disabled") return null;
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secret = process.env.YOOKASSA_SECRET_KEY?.trim();
  if ((mode !== "test" && mode !== "live") || !shopId || !/^\d+$/.test(shopId) || !secret ||
      (mode === "test" && (process.env.VERCEL_ENV === "production" || !secret.startsWith("test_"))) ||
      (mode === "live" && secret.startsWith("test_"))) {
    throw new PaymentError("PAYMENTS_NOT_CONFIGURED");
  }
  let origin: URL;
  try { origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? ""); }
  catch { throw new PaymentError("PAYMENT_RETURN_URL_INVALID"); }
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new PaymentError("PAYMENT_RETURN_URL_INVALID");
  }
  // A live return must not silently point to a temporary Vercel deployment.
  if (mode === "live" && (origin.hostname === "vercel.app" || origin.hostname.endsWith(".vercel.app"))) {
    throw new PaymentError("PAYMENT_RETURN_URL_INVALID");
  }
  return { mode: mode as YookassaMode, shopId, secret, origin: origin.origin };
}

export function assertPaymentCreationEnabled() {
  const config = getYookassaConfig();
  if (!config) throw new PaymentError("PAYMENTS_DISABLED");
  if (config.mode === "live" && (process.env.YOOKASSA_CRON_SECRET?.trim().length ?? 0) < 32) {
    throw new PaymentError("PAYMENT_FISCAL_RETRY_NOT_CONFIGURED");
  }
  return config;
}

export type YookassaPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  test: boolean;
  amount: { value: string; currency: string };
  recipient: { account_id: string };
  metadata: { orderId?: string; tenantId?: string };
  receipt_registration?: ReceiptRegistration;
  confirmation?: { type: string; confirmation_url?: string };
};

export function minorToValue(minor: number) {
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new PaymentError("PAYMENT_AMOUNT_INVALID", 409);
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

export async function yookassaRequest(path: string, body?: unknown, key?: string): Promise<YookassaPayment> {
  const value = await requestYookassa(path, body, key) as YookassaPayment;
  if (!value || typeof value.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(value.id) ||
      !["pending", "waiting_for_capture", "succeeded", "canceled"].includes(value.status) ||
      typeof value.paid !== "boolean" || typeof value.test !== "boolean" ||
      typeof value.amount?.value !== "string" || typeof value.amount?.currency !== "string" ||
      typeof value.recipient?.account_id !== "string" || !value.metadata || typeof value.metadata !== "object" ||
      (value.receipt_registration !== undefined && !["pending", "succeeded", "canceled"].includes(value.receipt_registration))) {
    throw new PaymentError("PAYMENT_PROVIDER_INVALID_RESPONSE");
  }
  return value;
}

export type YookassaFiscalReceipt = {
  id: string;
  type: string;
  payment_id: string;
  status: ReceiptRegistration;
  items: Array<{
    description: string; quantity: number; amount: { value: string; currency: string };
    vat_code: number; payment_mode: string; payment_subject: string;
  }>;
};

export async function yookassaReceiptRequest(path: string, body?: unknown, key?: string): Promise<YookassaFiscalReceipt> {
  const value = await requestYookassa(path, body, key) as YookassaFiscalReceipt;
  if (!value || typeof value.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(value.id) ||
      typeof value.payment_id !== "string" || value.type !== "payment" ||
      !["pending", "succeeded", "canceled"].includes(value.status) || !Array.isArray(value.items)) {
    throw new PaymentError("FISCAL_PROVIDER_INVALID_RESPONSE");
  }
  return value;
}

async function requestYookassa(path: string, body?: unknown, key?: string): Promise<unknown> {
  const config = getYookassaConfig();
  if (!config) throw new PaymentError("PAYMENTS_DISABLED");
  if (body) {
    assertPaymentCreationEnabled();
    if (!key || key.length > 64) throw new PaymentError("PAYMENT_IDEMPOTENCY_REQUIRED", 409);
  }
  try {
    const response = await fetch(`https://api.yookassa.ru/v3/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.shopId}:${config.secret}`).toString("base64")}`,
        "Content-Type": "application/json",
        ...(key ? { "Idempotence-Key": key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new PaymentError("PAYMENT_PROVIDER_UNAVAILABLE");
    return await response.json();
  } catch (error) {
    // Never expose provider bodies, fetch errors, credentials or payment instruments.
    if (error instanceof PaymentError) throw error;
    throw new PaymentError("PAYMENT_PROVIDER_UNAVAILABLE");
  }
}
