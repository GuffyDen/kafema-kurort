import type { MenuSelection } from "@/lib/menuStore";

export const PERSONAL_DATA_CONSENT_VERSION = "2026-08-24";

export const ORDER_STATUSES = [
  "new",
  "in_progress",
  "ready",
  "completed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItem = {
  id: string;
  name: string;
  volume: string;
  modifiers?: string[];
  baristaType?: "drink" | "food";
  categoryId?: string;
  categoryName?: string;
  workingZoneId?: string;
  type?: string;
  quantity: number;
};

export type PaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export type OrderPayment = {
  // Missing in preparation-stage records: always a test intent, never live.
  mode?: "test" | "live";
  status: PaymentStatus;
  revision: number;
  idempotencyKey: string;
  initiatedAt: string;
  shopId: string;
  returnUrl: string;
  id?: string;
  confirmationUrl?: string;
  paidAt?: string;
  // Missing means the intent predates receipts; never change its POST payload.
  receiptVersion?: 1 | 2;
};

export type ReceiptRegistration = "pending" | "succeeded" | "canceled";
export type OrderFiscal = {
  revision: number;
  prepayment: { status: ReceiptRegistration | "not_created" | "unknown"; updatedAt?: string };
  settlement?: {
    state: "pending" | "succeeded" | "needs_review";
    idempotencyKey: string;
    requiredAt: string;
    firstAttemptAt?: string;
    receiptId?: string;
    registration?: ReceiptRegistration;
    attempts: number;
  };
  nextAttemptAt?: number;
  leaseUntil?: number;
  lastError?: string;
};

export type OrderBase = {
  id: string;
  number: string;
  customerName: string;
  comment?: string;
  createdAt: string;
  completedAt?: string;
  statusChangedAt: string;
  items: OrderItem[];
  status: OrderStatus;
  source: "client";
  total: number;
  paymentStatus?: PaymentStatus;
};

export type CustomerOrder = OrderBase;

export type BaristaOrder = OrderBase & {
  phone: string;
  personalDataConsent: true;
  personalDataConsentAt: string;
  personalDataConsentVersion: string;
};

export type ServerOrderItem = OrderItem & {
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type ServerOrder = Omit<OrderBase, "items" | "total"> & {
  tenantId: string;
  payment?: OrderPayment;
  phone: string;
  email?: string;
  fiscal?: OrderFiscal;
  items: ServerOrderItem[];
  totalMinor: number;
  personalDataConsent: true;
  personalDataConsentAt: string;
  personalDataConsentVersion: string;
  customerAccessTokenHash: string;
};

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
  selection: MenuSelection;
};

export type CreateOrderInput = {
  customerName: string;
  phone: string;
  email: string;
  comment?: string;
  items: CreateOrderItemInput[];
  personalDataConsent: boolean;
  personalDataConsentVersion: string;
};

export type CustomerOrderReference = {
  id: string;
  accessToken: string;
};
