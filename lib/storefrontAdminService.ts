import { getStorefrontAvailabilityDiagnostic } from "@/lib/storefrontAvailabilityService";
import { getStorefront } from "@/lib/storefrontService";
import type { StorefrontAdminResponse } from "@/lib/storefrontTypes";

export async function getAdminStorefront(): Promise<StorefrontAdminResponse> {
  const [storefront, availability] = await Promise.all([
    getStorefront(),
    getStorefrontAvailabilityDiagnostic(),
  ]);

  return {
    ...storefront,
    syncStatus: {
      menuSyncedAt: storefront.syncedAt,
      ...availability,
    },
  };
}
