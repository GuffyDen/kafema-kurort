export type StorefrontAvailabilityItem = {
  available: boolean;
  balance: number | null;
};

export type StorefrontAvailabilityErrorInfo = {
  at: string;
  message: string;
};

export type StorefrontAvailabilitySnapshot = {
  checkedAt: string;
  items: Record<string, StorefrontAvailabilityItem>;
  stale?: boolean;
  lastError?: StorefrontAvailabilityErrorInfo | null;
};
