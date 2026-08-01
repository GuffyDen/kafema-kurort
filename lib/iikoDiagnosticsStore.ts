import {
  readStorefrontJson,
  writeStorefrontJson,
} from "@/lib/storefrontStorage";
import { getTenantId } from "@/lib/tenantSettingsStore";

export type IikoDiagnosticProduct = {
  id: string | null;
  name: string;
  price: number | null;
};

export type IikoDiagnosticSnapshot = {
  version: 1;
  ok: true;
  authVersion: "v2";
  tokenReceived: true;
  organizationsCount: number;
  terminalGroupsCount: number;
  terminalGroupFound: true;
  selectedOrganizationId: string;
  selectedOrganizationName: string;
  selectedTerminalGroupId: string;
  selectedTerminalGroupName: string;
  externalMenuId: string;
  externalMenuName: string;
  priceCategoriesCount: number;
  firstProducts: IikoDiagnosticProduct[];
  categoriesCount: number;
  productsCount: number;
  modifiersCount: number;
  menuReceived: true;
  checkedAt: string;
};

export async function readLastSuccessfulIikoDiagnostics() {
  const storage = getIikoDiagnosticsStorage();
  return readStorefrontJson<IikoDiagnosticSnapshot>(
    storage.redisKey,
    storage.localFileName,
  );
}

export async function writeLastSuccessfulIikoDiagnostics(
  snapshot: IikoDiagnosticSnapshot,
) {
  const storage = getIikoDiagnosticsStorage();
  return writeStorefrontJson(storage.redisKey, storage.localFileName, snapshot);
}

function getIikoDiagnosticsStorage() {
  const tenantId = getTenantId();
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, "-");

  return {
    redisKey: `tablo:tenant:${tenantId}:iiko-diagnostics:v1`,
    localFileName: `iiko-diagnostics-${safeTenantId}.json`,
  };
}
