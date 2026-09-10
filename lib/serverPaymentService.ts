import "server-only";
import type { ServerOrder } from "@/lib/orderTypes";
import { getPersistedOrder, recordPrepaymentRegistration, updatePersistedOrderPayment } from "@/lib/serverOrderRepository";
import { verifyOrderAccessToken } from "@/lib/serverOrderSecurity";
import { getTenantId } from "@/lib/tenantSettingsStore";
import { buildYookassaReceipt, YOOKASSA_RECEIPT_VERSION } from "@/lib/yookassaReceipt";
import { assertPaymentCreationEnabled, getYookassaConfig, minorToValue, PaymentError, yookassaRequest, type YookassaPayment } from "@/lib/yookassaClient";

export async function getAuthorizedPaymentOrder(id: string, token: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !token) throw new PaymentError("ORDER_NOT_FOUND", 404);
  const order = await getPersistedOrder(getTenantId(), id);
  if (!order || !verifyOrderAccessToken(token, order.customerAccessTokenHash)) {
    throw new PaymentError("ORDER_NOT_FOUND", 404);
  }
  return order;
}

function assertPaymentConfig(order: ServerOrder) {
  const config = getYookassaConfig();
  if (!config) throw new PaymentError("PAYMENTS_DISABLED");
  if (!order.payment || (order.payment.mode ?? "test") !== config.mode ||
      order.payment.shopId !== config.shopId || order.tenantId !== getTenantId()) {
    throw new PaymentError("PAYMENT_ORDER_MISMATCH", 409);
  }
  return config;
}

export function assertMatches(order: ServerOrder, remote: YookassaPayment) {
  const config = assertPaymentConfig(order);
  if ((order.payment?.id && remote.id !== order.payment.id) ||
      remote.metadata.orderId !== order.id || remote.metadata.tenantId !== order.tenantId ||
      remote.amount.currency !== "RUB" || remote.amount.value !== minorToValue(order.totalMinor) ||
      remote.recipient.account_id !== config.shopId || remote.test !== (config.mode === "test") ||
      (remote.status === "succeeded" && remote.paid !== true)) {
    throw new PaymentError("PAYMENT_VERIFICATION_FAILED", 409);
  }
}

export async function ensureOrderPayment(order: ServerOrder): Promise<ServerOrder> {
  assertPaymentConfig(order);
  const intent = order.payment!;
  if (intent.id) return order;
  assertPaymentCreationEnabled();
  // Adding a receipt to an older ambiguous POST would reuse its key with a
  // different body. Existing attached payments can still be verified normally.
  if (intent.receiptVersion !== YOOKASSA_RECEIPT_VERSION) {
    throw new PaymentError("PAYMENT_RECONCILIATION_REQUIRED", 409);
  }
  // The provider deduplicates for only 24h. Never issue an ambiguous late retry.
  if (Date.now() - Date.parse(intent.initiatedAt) >= 23 * 60 * 60 * 1000 ||
      !Number.isFinite(Date.parse(intent.initiatedAt))) {
    throw new PaymentError("PAYMENT_RECONCILIATION_REQUIRED", 409);
  }
  const receipt = buildYookassaReceipt(order);
  const remote = await yookassaRequest("payments", {
    amount: { value: minorToValue(order.totalMinor), currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: intent.returnUrl },
    description: `Заказ №${order.number}`,
    metadata: { orderId: order.id, tenantId: order.tenantId },
    receipt,
  }, intent.idempotencyKey);
  assertMatches(order, remote);
  const confirmationUrl = remote.confirmation?.confirmation_url;
  if (remote.status === "pending") {
    let url: URL;
    try { url = new URL(confirmationUrl ?? ""); } catch { throw new PaymentError("PAYMENT_CONFIRMATION_INVALID"); }
    if (remote.confirmation?.type !== "redirect" || url.protocol !== "https:" || url.username || url.password) {
      throw new PaymentError("PAYMENT_CONFIRMATION_INVALID");
    }
  }
  // POST response attaches the ID only. Successful payment always requires GET verification.
  const saved = await updatePersistedOrderPayment(order, { ...intent, id: remote.id, confirmationUrl });
  if (saved) return recordPrepaymentRegistration(saved, remote.receipt_registration);
  const current = await getPersistedOrder(order.tenantId, order.id);
  if (!current?.payment?.id || current.payment.id !== remote.id) throw new PaymentError("PAYMENT_CONFLICT", 409);
  return recordPrepaymentRegistration(current, remote.receipt_registration);
}

export async function refreshOrderPayment(order: ServerOrder): Promise<ServerOrder> {
  assertPaymentConfig(order);
  if (!order.payment?.id) return order;
  if (["succeeded", "canceled"].includes(order.payment.status) &&
      (!order.fiscal || ["succeeded", "canceled"].includes(order.fiscal.prepayment.status))) return order;
  const remote = await yookassaRequest(`payments/${encodeURIComponent(order.payment.id)}`);
  const updated = await applyVerifiedPayment(order, remote);
  return recordPrepaymentRegistration(updated, remote.receipt_registration);
}

async function applyVerifiedPayment(order: ServerOrder, remote: YookassaPayment): Promise<ServerOrder> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assertMatches(order, remote);
    const payment = order.payment!;
    if (!payment.id || payment.id !== remote.id) throw new PaymentError("PAYMENT_ID_MISMATCH", 409);
    if (payment.status === remote.status || payment.status === "succeeded" || payment.status === "canceled") return order;
    // Do not regress waiting_for_capture on a delayed response.
    if (payment.status === "waiting_for_capture" && remote.status === "pending") return order;
    const saved = await updatePersistedOrderPayment(order, {
      ...payment, status: remote.status,
      ...(remote.status === "succeeded" ? { paidAt: new Date().toISOString(), confirmationUrl: undefined } : {}),
      ...(remote.status === "canceled" ? { confirmationUrl: undefined } : {}),
    });
    if (saved) return saved;
    const current = await getPersistedOrder(order.tenantId, order.id);
    if (!current) throw new PaymentError("ORDER_NOT_FOUND", 404);
    order = current;
  }
  throw new PaymentError("PAYMENT_CONFLICT", 409);
}

export async function processPaymentNotification(value: unknown) {
  if (!getYookassaConfig()) throw new PaymentError("PAYMENTS_DISABLED");
  if (!value || typeof value !== "object") throw new PaymentError("INVALID_NOTIFICATION", 400);
  const notification = value as { type?: unknown; event?: unknown; object?: { id?: unknown } };
  if (notification.type !== "notification" || typeof notification.event !== "string") throw new PaymentError("INVALID_NOTIFICATION", 400);
  if (!["payment.succeeded", "payment.canceled", "payment.waiting_for_capture"].includes(notification.event)) return;
  const id = notification.object?.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw new PaymentError("INVALID_NOTIFICATION", 400);
  // No trust in notification metadata/amount/status or forwarded IP headers.
  const remote = await yookassaRequest(`payments/${encodeURIComponent(id)}`);
  if (remote.id !== id) throw new PaymentError("PAYMENT_ID_MISMATCH", 409);
  const orderId = remote.metadata.orderId;
  if (typeof orderId !== "string" || !/^[0-9a-f-]{36}$/i.test(orderId)) throw new PaymentError("PAYMENT_ORDER_MISMATCH", 409);
  let order = await getPersistedOrder(getTenantId(), orderId);
  if (!order?.payment) throw new PaymentError("PAYMENT_ORDER_MISMATCH", 409);
  assertMatches(order, remote);
  // Recover a lost POST response with the persisted key, never bind an arbitrary ID.
  if (!order.payment.id) order = await ensureOrderPayment(order);
  const updated = await applyVerifiedPayment(order, remote);
  await recordPrepaymentRegistration(updated, remote.receipt_registration);
}

export function paymentResponse(order: ServerOrder) {
  return {
    paymentStatus: order.payment?.status ?? null,
    confirmationUrl: order.payment?.status === "pending" ? order.payment.confirmationUrl ?? null : null,
  };
}
