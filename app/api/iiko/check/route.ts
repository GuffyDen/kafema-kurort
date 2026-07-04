import {
  checkIikoConnectionReadOnly,
  type IikoReadOnlyCheckResult,
} from "@/lib/iikoCloudClient";

export async function GET() {
  const check = await checkIikoConnectionReadOnly();

  return Response.json(serializeIikoCheck(check), { status: 200 });
}

export async function POST() {
  const check = await checkIikoConnectionReadOnly();
  const diagnostics = serializeIikoCheck(check);

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
  });
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
    availableTerminalGroups: check.availableTerminalGroups,
    menuReceived: check.menuReceived,
    productsCount: check.productsCount,
    categoriesCount: check.categoriesCount,
    modifiersCount: check.modifiersCount,
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
