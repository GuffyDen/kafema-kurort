import "server-only";
import type { OrderFiscal, ServerOrder } from "@/lib/orderTypes";
import { getFiscalQueueCounts, getPersistedOrder, listDueFiscalOrders, updatePersistedOrderFiscal } from "@/lib/serverOrderRepository";
import { assertMatches } from "@/lib/serverPaymentService";
import { getTenantId } from "@/lib/tenantSettingsStore";
import { buildYookassaSettlementReceipt } from "@/lib/yookassaReceipt";
import { getYookassaConfig, PaymentError, yookassaReceiptRequest, yookassaRequest, type YookassaFiscalReceipt } from "@/lib/yookassaClient";

const leaseMs = 180_000;
const providerRetryWindowMs = 23 * 60 * 60 * 1000;

// This entry point is safe in Next.after and in cron. A lost process or failed
// persistence leaves the durable due-time/lease and the same provider key intact.
export async function processFiscalOrder(orderId: string, now = Date.now()) {
  try { return await processOrder(orderId, now); }
  catch { return "retry" as const; }
}

async function processOrder(orderId: string, now: number) {
  if (!getYookassaConfig()) return "disabled" as const;
  const order = await getPersistedOrder(getTenantId(), orderId);
  if (!order?.fiscal || !order.payment?.id) return "skipped" as const;
  if (order.fiscal.nextAttemptAt === undefined || order.fiscal.nextAttemptAt > now ||
      (order.fiscal.leaseUntil ?? 0) > now) return "skipped" as const;

  let claimed = await updatePersistedOrderFiscal(order, { ...order.fiscal,
    leaseUntil: now + leaseMs, nextAttemptAt: now + leaseMs,
  });
  if (!claimed) return "skipped" as const;
  const fiscal: OrderFiscal = { ...claimed.fiscal!, prepayment: { ...claimed.fiscal!.prepayment },
    settlement: claimed.fiscal!.settlement ? { ...claimed.fiscal!.settlement } : undefined };

  try {
    const payment = await yookassaRequest(`payments/${encodeURIComponent(order.payment.id)}`);
    assertMatches(order, payment);
    if (!["succeeded", "canceled"].includes(fiscal.prepayment.status)) {
      fiscal.prepayment = { status: payment.receipt_registration ?? "unknown", updatedAt: new Date(now).toISOString() };
    }
    const settlement = fiscal.settlement;
    if (settlement?.state === "pending") {
      if (order.status !== "completed" || order.payment.status !== "succeeded" || payment.status !== "succeeded" || !payment.paid) {
        throw new PaymentError("FISCAL_ORDER_NOT_READY", 409);
      }
      if (fiscal.prepayment.status === "canceled") throw new PaymentError("FISCAL_PREPAYMENT_CANCELED", 409);
      if (fiscal.prepayment.status !== "succeeded") throw new PaymentError("FISCAL_PREPAYMENT_PENDING");
      const body = buildYookassaSettlementReceipt(order);
      if (!settlement.receiptId) {
        const firstAttempt = settlement.firstAttemptAt ? Date.parse(settlement.firstAttemptAt) : now;
        if (!Number.isFinite(firstAttempt) || now - firstAttempt >= providerRetryWindowMs) {
          throw new PaymentError("FISCAL_RECONCILIATION_REQUIRED", 409);
        }
        // Commit the ambiguity window BEFORE the first external POST.
        settlement.firstAttemptAt ??= new Date(now).toISOString();
        settlement.attempts += 1;
        const saved = await updatePersistedOrderFiscal(claimed, fiscal);
        if (!saved) return "skipped" as const;
        claimed = saved;
      }
      const receipt = settlement.receiptId
        ? await yookassaReceiptRequest(`receipts/${encodeURIComponent(settlement.receiptId)}`)
        : await yookassaReceiptRequest("receipts", body, settlement.idempotencyKey);
      assertReceiptMatches(order, receipt, body);
      if (settlement.receiptId && settlement.receiptId !== receipt.id) throw new PaymentError("FISCAL_RECEIPT_MISMATCH", 409);
      settlement.receiptId = receipt.id;
      settlement.registration = receipt.status;
      settlement.state = receipt.status === "succeeded" ? "succeeded" : receipt.status === "canceled" ? "needs_review" : "pending";
      fiscal.lastError = receipt.status === "canceled" ? "FISCAL_RECEIPT_CANCELED" : undefined;
    }
    fiscal.leaseUntil = undefined;
    const prepaymentWaiting = ["pending", "unknown"].includes(fiscal.prepayment.status);
    const overdue = prepaymentWaiting && now - Date.parse(order.createdAt) >= 3 * 24 * 60 * 60 * 1000;
    if (overdue) fiscal.lastError = "FISCAL_PREPAYMENT_OVERDUE";
    fiscal.nextAttemptAt = fiscal.settlement?.state === "pending" ? now + 60_000 :
      prepaymentWaiting && !overdue ? now + 60_000 : undefined;
    if (!await updatePersistedOrderFiscal(claimed, fiscal)) return "retry" as const;
    return fiscal.settlement?.state === "needs_review" || overdue ? "needs_review" as const : "processed" as const;
  } catch (error) {
    const overdue = ["pending", "unknown"].includes(fiscal.prepayment.status) && now - Date.parse(order.createdAt) >= 3 * 24 * 60 * 60 * 1000;
    const code = overdue ? "FISCAL_PREPAYMENT_OVERDUE" : error instanceof PaymentError ? error.code : "FISCAL_TEMPORARILY_UNAVAILABLE";
    const permanent = overdue || error instanceof PaymentError && (error.status === 400 || error.status === 409 || code === "FISCAL_PROVIDER_INVALID_RESPONSE");
    fiscal.lastError = code;
    fiscal.leaseUntil = undefined;
    if (permanent && fiscal.settlement) fiscal.settlement.state = "needs_review";
    const attempts = fiscal.settlement?.attempts ?? 1;
    fiscal.nextAttemptAt = permanent ? undefined : now + Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempts, 6));
    await updatePersistedOrderFiscal(claimed, fiscal);
    return permanent ? "needs_review" as const : "retry" as const;
  }
}

function assertReceiptMatches(order: ServerOrder, receipt: YookassaFiscalReceipt, expected: ReturnType<typeof buildYookassaSettlementReceipt>) {
  if (receipt.payment_id !== order.payment?.id || receipt.items.length !== expected.items.length) {
    throw new PaymentError("FISCAL_RECEIPT_MISMATCH", 409);
  }
  const signature = (item: YookassaFiscalReceipt["items"][number]) => JSON.stringify([
    item?.description, Number(item?.quantity), item?.amount?.value, item?.amount?.currency,
    item?.vat_code, item?.payment_mode, item?.payment_subject,
  ]);
  if (JSON.stringify(receipt.items.map(signature).sort()) !== JSON.stringify(expected.items.map(signature).sort())) {
    throw new PaymentError("FISCAL_RECEIPT_MISMATCH", 409);
  }
}

export async function processFiscalQueue() {
  if (!getYookassaConfig()) return { disabled: true, processed: 0, retry: 0, needsReview: 0, pending: 0 };
  const tenantId = getTenantId();
  const ids = await listDueFiscalOrders(tenantId, Date.now(), 5);
  const results = await Promise.all(ids.map((id) => processFiscalOrder(id)));
  const counts = await getFiscalQueueCounts(tenantId);
  return { disabled: false, processed: results.filter((value) => value === "processed").length,
    retry: results.filter((value) => value === "retry").length, ...counts };
}
