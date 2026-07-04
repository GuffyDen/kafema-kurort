import {
  checkIikoConnectionReadOnly,
  checkIikoConnectionReal,
} from "@/lib/iikoCloudClient";

export async function GET() {
  const check = await checkIikoConnectionReadOnly();

  return Response.json(
    {
      ok: check.ok,
      tokenReceived: check.tokenReceived,
      organizationsCount: check.organizationsCount,
      selectedOrganizationId: check.selectedOrganizationId,
      selectedOrganizationName: check.selectedOrganizationName,
      terminalGroupId: check.terminalGroupId,
      terminalGroupFound: check.terminalGroupFound,
      menuReceived: check.menuReceived,
      counts: check.counts,
      endpoints: check.endpoints,
      errors: check.errors.map((error) => ({
        ...error,
        message: sanitizeIikoError(error.message),
      })),
    },
    { status: 200 },
  );
}

export async function POST() {
  try {
    const result = await checkIikoConnectionReal();

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? sanitizeIikoError(error.message)
            : "Не удалось подключиться к iiko",
      },
      { status: 200 },
    );
  }
}

function sanitizeIikoError(message: string) {
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ********");
}
