import {
  fetchIikoStopList,
  IikoHttpError,
  type IikoStopListSource,
} from "@/lib/iikoCloudClient";
import type { StorefrontAvailabilitySnapshot } from "@/lib/storefrontAvailabilityTypes";
import {
  readStorefrontJson,
  releaseStorefrontLock,
  storefrontRedisKeys,
  tryAcquireStorefrontLock,
  writeStorefrontJson,
} from "@/lib/storefrontStorage";
import { readStorefrontMenuSnapshot } from "@/lib/storefrontSnapshotStore";

const localFileName = "stop-list.json";
const freshnessMs = 10_000;
const lockTtlMs = 60_000;
let inFlightRefresh: Promise<StorefrontAvailabilitySnapshot> | null = null;
let memorySnapshot: StorefrontAvailabilitySnapshot | null = null;

export class StorefrontAvailabilityError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly correlationId: string | null = null,
  ) {
    super(message);
  }
}

export async function getStorefrontAvailability() {
  const stored = await readStoredSnapshotSafely();
  const current = newestSnapshot(memorySnapshot, stored);

  if (current && isFresh(current)) {
    return current;
  }

  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = refreshAvailability(current);

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

async function refreshAvailability(
  fallback: StorefrontAvailabilitySnapshot | null,
) {
  const lockOwner = crypto.randomUUID();
  let acquired = true;

  try {
    const lock = await tryAcquireStorefrontLock(
      storefrontRedisKeys.stopListLock,
      lockOwner,
      lockTtlMs,
    );
    acquired = lock.acquired;

    if (!acquired) {
      if (fallback) return { ...fallback, stale: true };

      const shared = await waitForSharedRefresh();
      if (shared) return shared;
    }

    const menuSnapshot = await readStorefrontMenuSnapshot().catch(() => null);
    const source = await fetchIikoStopList(
      menuSnapshot?.value?.source
        ? {
            organizationId: menuSnapshot.value.source.organization.id,
            terminalGroupId: menuSnapshot.value.source.terminalGroup.id,
          }
        : undefined,
    );
    const snapshot = normalizeStopList(source);

    try {
      await writeStorefrontJson(
        storefrontRedisKeys.stopList,
        localFileName,
        snapshot,
      );
    } catch (error) {
      console.warn(
        "Storefront availability cache write failed:",
        getSafeErrorMessage(error),
      );
    }

    memorySnapshot = snapshot;
    return snapshot;
  } catch (error) {
    console.warn("Storefront availability refresh failed:", getSafeErrorMessage(error));

    if (fallback) {
      const failedSnapshot: StorefrontAvailabilitySnapshot = {
        ...fallback,
        stale: true,
        lastError: {
          at: new Date().toISOString(),
          message: "Не удалось обновить stop-list из iiko",
        },
      };
      memorySnapshot = failedSnapshot;

      try {
        await writeStorefrontJson(
          storefrontRedisKeys.stopList,
          localFileName,
          failedSnapshot,
        );
      } catch (writeError) {
        console.warn(
          "Storefront availability error state write failed:",
          getSafeErrorMessage(writeError),
        );
      }

      return failedSnapshot;
    }

    if (error instanceof IikoHttpError) {
      throw new StorefrontAvailabilityError(
        "Не удалось проверить наличие товаров",
        error.status,
        error.correlationId,
      );
    }

    throw new StorefrontAvailabilityError("Не удалось проверить наличие товаров");
  } finally {
    if (acquired) {
      try {
        await releaseStorefrontLock(storefrontRedisKeys.stopListLock);
      } catch (error) {
        console.warn(
          "Storefront availability lock release failed:",
          getSafeErrorMessage(error),
        );
      }
    }
  }
}

function normalizeStopList(
  source: IikoStopListSource,
): StorefrontAvailabilitySnapshot {
  const items: StorefrontAvailabilitySnapshot["items"] = {};
  const wrappers = Array.isArray(source.response.terminalGroupStopLists)
    ? source.response.terminalGroupStopLists.filter(isRecord)
    : [];

  wrappers
    .filter(
      (wrapper) =>
        typeof wrapper.organizationId !== "string" ||
        wrapper.organizationId === source.organizationId,
    )
    .flatMap((wrapper) =>
      Array.isArray(wrapper.items) ? wrapper.items.filter(isRecord) : [],
    )
    .filter(
      (list) =>
        typeof list.terminalGroupId !== "string" ||
        list.terminalGroupId === source.terminalGroupId,
    )
    .flatMap((list) =>
      Array.isArray(list.items) ? list.items.filter(isRecord) : [],
    )
    .forEach((item) => {
      const productId =
        typeof item.productId === "string" ? item.productId : null;
      const balance =
        typeof item.balance === "number" && Number.isFinite(item.balance)
          ? Math.max(0, item.balance)
          : 0;

      if (!productId) return;

      const previous = items[productId];
      const combinedBalance =
        previous?.balance === null
          ? balance
          : (previous?.balance ?? 0) + balance;

      items[productId] = {
        available: combinedBalance > 0,
        balance: combinedBalance,
      };
    });

  return {
    checkedAt: new Date().toISOString(),
    items,
    stale: false,
    lastError: null,
  };
}

export async function getStorefrontAvailabilityDiagnostic() {
  try {
    const snapshot = await getStorefrontAvailability();

    return {
      stopListCheckedAt: snapshot.checkedAt,
      stopListStale: snapshot.stale === true,
      lastError: snapshot.lastError ?? null,
    };
  } catch {
    return {
      stopListCheckedAt: null,
      stopListStale: true,
      lastError: {
        at: new Date().toISOString(),
        message: "Не удалось получить stop-list из iiko",
      },
    };
  }
}

async function readStoredSnapshotSafely() {
  try {
    return (
      await readStorefrontJson<StorefrontAvailabilitySnapshot>(
        storefrontRedisKeys.stopList,
        localFileName,
      )
    ).value;
  } catch (error) {
    console.warn(
      "Storefront availability cache read failed:",
      getSafeErrorMessage(error),
    );
    return null;
  }
}

async function waitForSharedRefresh() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const shared = await readStoredSnapshotSafely();
    if (shared && isFresh(shared)) {
      memorySnapshot = shared;
      return shared;
    }
  }

  return null;
}

function newestSnapshot(
  first: StorefrontAvailabilitySnapshot | null,
  second: StorefrontAvailabilitySnapshot | null,
) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(first.checkedAt) >= Date.parse(second.checkedAt)
    ? first
    : second;
}

function isFresh(snapshot: StorefrontAvailabilitySnapshot) {
  const checkedAt = Date.parse(snapshot.checkedAt);
  return Number.isFinite(checkedAt) && Date.now() - checkedAt < freshnessMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}
