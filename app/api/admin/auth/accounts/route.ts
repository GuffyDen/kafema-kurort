import {
  AuthAccountManagementError,
  getSafeAuthAccounts,
  updateAuthAccountCredentials,
} from "@/lib/serverAuthAccountManagement";
import { serializeExpiredAdminSessionCookie } from "@/lib/serverAdminAuth";
import { rejectUnauthorizedAdminRequest } from "@/lib/serverAdminRoute";
import type { AuthRole } from "@/lib/serverAuthAccountRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const rejected = await rejectUnauthorizedAdminRequest(request);
  if (rejected) return rejected;

  try {
    return Response.json(
      { accounts: await getSafeAuthAccounts() },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const rejected = await rejectUnauthorizedAdminRequest(request, {
    requireSameOrigin: true,
  });
  if (rejected) return rejected;

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 4_096) {
    return invalidRequestResponse();
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 4_096) return invalidRequestResponse();
    body = JSON.parse(text);
  } catch {
    return invalidRequestResponse();
  }
  if (!isRecord(body) || (body.role !== "admin" && body.role !== "barista")) {
    return invalidRequestResponse();
  }

  const role: AuthRole = body.role;
  if (
    typeof body.username !== "string" ||
    body.username.length > 128 ||
    !isOptionalString(body.currentPassword) ||
    !isOptionalString(body.newPassword) ||
    !isOptionalString(body.repeatPassword) ||
    (body.currentPassword?.length ?? 0) > 1_024 ||
    (body.newPassword?.length ?? 0) > 1_024 ||
    (body.repeatPassword?.length ?? 0) > 1_024
  ) {
    return invalidRequestResponse();
  }

  try {
    const account = await updateAuthAccountCredentials({
      role,
      username: body.username,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      repeatPassword: body.repeatPassword,
    });
    return Response.json(
      { account, reauthenticate: role === "admin" },
      {
        headers: {
          ...noStoreHeaders,
          ...(role === "admin"
            ? { "Set-Cookie": serializeExpiredAdminSessionCookie() }
            : {}),
        },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function invalidRequestResponse() {
  return Response.json(
    { error: "Некорректный запрос.", code: "INVALID_REQUEST" },
    { status: 400, headers: noStoreHeaders },
  );
}

function errorResponse(error: unknown) {
  if (error instanceof AuthAccountManagementError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: noStoreHeaders },
    );
  }
  return Response.json(
    { error: "Не удалось обновить данные доступа.", code: "AUTH_SETTINGS_FAILED" },
    { status: 500, headers: noStoreHeaders },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}
