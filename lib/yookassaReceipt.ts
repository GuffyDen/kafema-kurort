import "server-only";
import type { ServerOrder, ServerOrderItem } from "@/lib/orderTypes";
import { normalizeOrderPhone } from "@/lib/orderPhone";
import { normalizeOrderEmail } from "@/lib/orderEmail";
import { minorToValue, PaymentError } from "@/lib/yookassaClient";

// Bump the version when changing a persisted intent's provider POST contract.
// Version 1 was a phone-only preparation; version 2 requires customer email.
export const YOOKASSA_RECEIPT_VERSION = 2;

export type YookassaReceipt = {
  customer: { email: string; phone: string };
  internet: true;
  items: Array<{
    description: string;
    quantity: number;
    amount: { value: string; currency: "RUB" };
    vat_code: 1;
    payment_mode: "full_prepayment";
    payment_subject: "commodity";
    measure: "piece";
  }>;
};

export function buildYookassaReceipt(order: Pick<ServerOrder, "phone" | "email" | "items" | "totalMinor">): YookassaReceipt {
  const phone = normalizeOrderPhone(order.phone);
  if (!phone) throw new PaymentError("PAYMENT_RECEIPT_PHONE_REQUIRED", 400);
  const email = normalizeOrderEmail(order.email);
  if (!email) throw new PaymentError("PAYMENT_RECEIPT_EMAIL_REQUIRED", 400);
  if (!Array.isArray(order.items) || order.items.length === 0 || order.items.length > 80) {
    throw new PaymentError("PAYMENT_RECEIPT_ITEMS_INVALID", 409);
  }

  let totalMinor = 0;
  const items: YookassaReceipt["items"] = order.items.map((item) => {
    // Menu kinds are presentation categories, not fiscal classifications. Only
    // the confirmed ordinary food/drink assortment is supported by this profile;
    // certificates and other goods require a separate fiscal contract.
    if (!["drink", "food", "dessert"].includes(item.type ?? "")) {
      throw new PaymentError("PAYMENT_RECEIPT_ITEM_UNSUPPORTED", 409);
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor <= 0 ||
        !Number.isSafeInteger(item.lineTotalMinor) || item.lineTotalMinor !== item.unitPriceMinor * item.quantity) {
      throw new PaymentError("PAYMENT_RECEIPT_AMOUNT_MISMATCH", 409);
    }
    totalMinor += item.lineTotalMinor;
    if (!Number.isSafeInteger(totalMinor)) throw new PaymentError("PAYMENT_RECEIPT_AMOUNT_MISMATCH", 409);
    return {
      description: receiptDescription(item),
      quantity: item.quantity,
      // The stored unit price already includes the selected variant and addons.
      amount: { value: minorToValue(item.unitPriceMinor), currency: "RUB" },
      vat_code: 1,
      payment_mode: "full_prepayment",
      payment_subject: "commodity",
      measure: "piece",
    };
  });
  if (!Number.isSafeInteger(order.totalMinor) || totalMinor !== order.totalMinor) {
    throw new PaymentError("PAYMENT_RECEIPT_AMOUNT_MISMATCH", 409);
  }

  // OpenAPI Phone uses digits only ([0-9]{4,15}); keep +7 in the stored order.
  return { customer: { email, phone: phone.slice(1) }, internet: true, items };
}

export function buildYookassaSettlementReceipt(order: ServerOrder) {
  if (order.status !== "completed" || order.payment?.status !== "succeeded" || !order.payment.id ||
      order.payment.receiptVersion !== YOOKASSA_RECEIPT_VERSION) {
    throw new PaymentError("FISCAL_ORDER_NOT_READY", 409);
  }
  const receipt = buildYookassaReceipt(order);
  return {
    ...receipt,
    type: "payment" as const,
    payment_id: order.payment.id,
    send: true,
    items: receipt.items.map((item) => ({ ...item, payment_mode: "full_payment" as const })),
    settlements: [{ type: "prepayment" as const, amount: { value: minorToValue(order.totalMinor), currency: "RUB" } }],
  };
}

function cleanText(value: string) {
  return value.normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/gu, " ").trim();
}

function receiptDescription(item: ServerOrderItem) {
  const name = typeof item.name === "string" ? cleanText(item.name) : "";
  if (!name) throw new PaymentError("PAYMENT_RECEIPT_DESCRIPTION_INVALID", 409);
  const details = [item.volume, ...(item.modifiers ?? [])]
    .filter((value): value is string => typeof value === "string")
    .map(cleanText).filter(Boolean);
  const description = details.length ? `${name} (${details.join("; ")})` : name;
  // Never split a Unicode code point; the base product name always comes first.
  const characters = Array.from(description);
  return characters.length <= 128 ? description : `${characters.slice(0, 127).join("").trimEnd()}…`;
}
