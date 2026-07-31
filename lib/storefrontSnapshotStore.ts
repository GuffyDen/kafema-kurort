import type { IikoExternalMenuSource } from "@/lib/iikoCloudClient";
import {
  readStorefrontJson,
  storefrontRedisKeys,
  writeStorefrontJson,
} from "@/lib/storefrontStorage";

const localFileName = "storefront-menu.json";

export type StorefrontMenuSnapshot = {
  version: 1;
  revision: number | null;
  syncedAt: string;
  source: IikoExternalMenuSource;
};

export async function readStorefrontMenuSnapshot() {
  return readStorefrontJson<StorefrontMenuSnapshot>(
    storefrontRedisKeys.menu,
    localFileName,
  );
}

export async function writeStorefrontMenuSnapshot(
  source: IikoExternalMenuSource,
) {
  const snapshot: StorefrontMenuSnapshot = {
    version: 1,
    revision: getMenuRevision(source.menu),
    syncedAt: source.syncedAt,
    source,
  };

  const persistence = await writeStorefrontJson(
    storefrontRedisKeys.menu,
    localFileName,
    snapshot,
  );

  return { snapshot, persistence };
}

function getMenuRevision(menu: Record<string, unknown>) {
  return typeof menu.revision === "number" && Number.isFinite(menu.revision)
    ? menu.revision
    : null;
}
