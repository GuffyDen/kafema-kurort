import {
  checkIikoConnectionReadOnly,
  type IikoReadOnlyCheckResult,
} from "@/lib/iikoCloudClient";
import {
  readLastSuccessfulIikoDiagnostics,
  type IikoDiagnosticSnapshot,
  writeLastSuccessfulIikoDiagnostics,
} from "@/lib/iikoDiagnosticsStore";

export const dynamic = "force-dynamic";

const CHECK_CACHE_TTL_MS = 60_000;

let cachedCheck:
  | {
      checkedAt: number;
      check: IikoReadOnlyCheckResult;
    }
  | null = null;
let inFlightCheck: Promise<IikoReadOnlyCheckResult> | null = null;

export async function GET(request: Request) {
  if (shouldReadStoredResult(request)) {
    const stored = await readStoredDiagnostics();

    return Response.json(stored, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { cache, check } = await getReadOnlyCheck({
    refresh: shouldRefresh(request),
  });

  const persistenceWarning = await persistSuccessfulCheck(check, cache.checkedAt);

  return Response.json(
    {
      ...serializeIikoCheck(check),
      cache: addCacheWarning(cache, persistenceWarning),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const { cache, check } = await getReadOnlyCheck({
    refresh: shouldRefresh(request),
  });
  const persistenceWarning = await persistSuccessfulCheck(check, cache.checkedAt);
  const diagnostics = {
    ...serializeIikoCheck(check),
    cache: addCacheWarning(cache, persistenceWarning),
  };

  if (!check.ok || !check.result) {
    return Response.json(
      {
        ok: false,
        error: check.errors[0]?.message ?? "Не удалось подключиться к iiko",
        diagnostics,
      },
      { status: 200 },
    );
  }

  return Response.json({
    ok: true,
    result: check.result,
    diagnostics,
    cache,
  });
}

async function getReadOnlyCheck({ refresh = false }: { refresh?: boolean } = {}) {
  const now = Date.now();

  if (!refresh && cachedCheck && now - cachedCheck.checkedAt < CHECK_CACHE_TTL_MS) {
    return {
      check: cachedCheck.check,
      cache: createCacheInfo("fresh", cachedCheck.checkedAt),
    };
  }

  if (refresh) {
    const check = await checkIikoConnectionReadOnly();
    cachedCheck = {
      checkedAt: Date.now(),
      check,
    };

    return {
      check,
      cache: createCacheInfo("refresh", cachedCheck.checkedAt),
    };
  }

  if (!inFlightCheck) {
    inFlightCheck = checkIikoConnectionReadOnly().finally(() => {
      inFlightCheck = null;
    });
  }

  const check = await inFlightCheck;
  const hitRateLimit = check.endpoints.some((endpoint) => endpoint.status === 429);

  if (hitRateLimit && cachedCheck) {
    return {
      check: cachedCheck.check,
      cache: {
        ...createCacheInfo("stale-after-rate-limit", cachedCheck.checkedAt),
        warning:
          "iiko вернула rate limit. Показана последняя успешная диагностика.",
      },
    };
  }

  cachedCheck = {
    checkedAt: Date.now(),
    check,
  };

  return {
    check,
    cache: createCacheInfo("updated", cachedCheck.checkedAt),
  };
}

function createCacheInfo(
  status: "fresh" | "updated" | "stale-after-rate-limit" | "refresh",
  checkedAt: number,
) {
  return {
    status,
    checkedAt: new Date(checkedAt).toISOString(),
    ageMs: Math.max(0, Date.now() - checkedAt),
    ttlMs: CHECK_CACHE_TTL_MS,
  };
}

function shouldRefresh(request: Request) {
  return new URL(request.url).searchParams.get("refresh") === "1";
}

function shouldReadStoredResult(request: Request) {
  return new URL(request.url).searchParams.get("stored") === "1";
}

async function readStoredDiagnostics() {
  try {
    const { value, persistence } = await readLastSuccessfulIikoDiagnostics();

    return {
      ok: true,
      diagnostics: value,
      cache: {
        status: value ? "stored" : "empty",
        checkedAt: value?.checkedAt,
        persistence: persistence.mode,
        warning: persistence.warning,
      },
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: null,
      cache: {
        status: "unavailable",
        warning:
          error instanceof Error
            ? sanitizeIikoError(error.message)
            : "Не удалось прочитать сохранённую диагностику iiko.",
      },
    };
  }
}

async function persistSuccessfulCheck(
  check: IikoReadOnlyCheckResult,
  checkedAt: string,
) {
  const snapshot = createDiagnosticSnapshot(check, checkedAt);

  if (!snapshot) return null;

  try {
    await writeLastSuccessfulIikoDiagnostics(snapshot);
    return null;
  } catch (error) {
    return error instanceof Error
      ? `Не удалось сохранить последнюю успешную диагностику: ${sanitizeIikoError(error.message)}`
      : "Не удалось сохранить последнюю успешную диагностику.";
  }
}

function createDiagnosticSnapshot(
  check: IikoReadOnlyCheckResult,
  checkedAt: string,
): IikoDiagnosticSnapshot | null {
  if (
    !check.ok ||
    !check.tokenReceived ||
    !check.menuReceived ||
    !check.selectedOrganizationId ||
    !check.selectedOrganizationName ||
    !check.selectedTerminalGroupId ||
    !check.selectedTerminalGroupName ||
    !check.externalMenuId ||
    !check.externalMenuName
  ) {
    return null;
  }

  return {
    version: 1,
    ok: true,
    authVersion: "v2",
    tokenReceived: true,
    organizationsCount: check.organizationsCount,
    terminalGroupsCount: check.terminalGroupsCount,
    terminalGroupFound: true,
    selectedOrganizationId: check.selectedOrganizationId,
    selectedOrganizationName: check.selectedOrganizationName,
    selectedTerminalGroupId: check.selectedTerminalGroupId,
    selectedTerminalGroupName: check.selectedTerminalGroupName,
    externalMenuId: check.externalMenuId,
    externalMenuName: check.externalMenuName,
    priceCategoriesCount: check.priceCategoriesCount,
    firstProducts: check.firstProducts,
    categoriesCount: check.categoriesCount,
    productsCount: check.productsCount,
    modifiersCount: check.modifiersCount,
    menuReceived: true,
    checkedAt,
  };
}

function addCacheWarning<T extends { status: string; warning?: string }>(
  cache: T,
  persistenceWarning: string | null,
) {
  return persistenceWarning
    ? {
        ...cache,
        warning: cache.warning
          ? `${cache.warning} ${persistenceWarning}`
          : persistenceWarning,
      }
    : cache;
}

function serializeIikoCheck(check: IikoReadOnlyCheckResult) {
  return {
    ok: check.ok,
    authVersion: check.authVersion,
    tokenReceived: check.tokenReceived,
    authHttpStatus: check.authHttpStatus,
    authError: check.authError,
    organizationsCount: check.organizationsCount,
    selectedOrganizationId: check.selectedOrganizationId,
    selectedOrganizationName: check.selectedOrganizationName,
    terminalGroupsCount: check.terminalGroupsCount,
    terminalGroupFound: check.terminalGroupFound,
    terminalGroupId: check.terminalGroupId,
    selectedTerminalGroupId: check.selectedTerminalGroupId,
    selectedTerminalGroupName: check.selectedTerminalGroupName,
    externalMenuId: check.externalMenuId,
    externalMenuName: check.externalMenuName,
    priceCategoriesCount: check.priceCategoriesCount,
    firstProducts: check.firstProducts,
    availableTerminalGroups: check.availableTerminalGroups,
    menuReceived: check.menuReceived,
    productsCount: check.productsCount,
    categoriesCount: check.categoriesCount,
    modifiersCount: check.modifiersCount,
    nomenclature: check.nomenclature,
    nomenclatureByOrganization: check.nomenclatureByOrganization,
    externalMenu: check.externalMenu,
    counts: check.counts,
    endpoints: check.endpoints.map((endpoint) => ({
      ...endpoint,
      error: endpoint.error ? sanitizeIikoError(endpoint.error) : undefined,
      response: sanitizeIikoPayload(endpoint.response),
    })),
    rawErrors: check.rawErrors.map((error) => ({
      ...error,
      message: sanitizeIikoError(error.message),
      response: sanitizeIikoPayload(error.response),
    })),
    errors: check.errors.map((error) => ({
      ...error,
      message: sanitizeIikoError(error.message),
      response: sanitizeIikoPayload(error.response),
    })),
  };
}

function sanitizeIikoError(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._=-]+/g, "Bearer ********")
    .replace(
      /("?(?:apiLogin|apiKey|appId|clientSecret|token)"?\s*[:=]\s*)"[^"]+"/gi,
      "$1\"********\"",
    );
}

function sanitizeIikoPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeIikoPayload(item));
  }

  if (!isRecord(value)) {
    return typeof value === "string" ? sanitizeIikoError(value) : value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /^(apiLogin|apiKey|appId|clientSecret|token|accessToken|authorization)$/i.test(
        key,
      )
        ? "********"
        : sanitizeIikoPayload(item),
    ]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
