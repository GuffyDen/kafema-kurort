import { hashAuthPassword } from "@/lib/serverAuthPassword";
import {
  AuthAccountConflictError,
  AuthAccountStorageError,
  createAuthAccount,
  getAuthAccount,
  normalizeAuthUsername,
  replaceAuthAccountCredentials,
  type AuthRole,
} from "@/lib/serverAuthAccountRepository";
import { verifyProductionProjectOidcToken } from "@/lib/serverVercelOidc.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };
const maxBodyLength = 4_096;

export async function POST(request: Request) {
  const token = getBearerToken(request.headers.get("authorization"));
  if (!token || !(await verifyProductionProjectOidcToken(token))) {
    return response({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBodyLength) {
    return response({ error: "Invalid request", code: "INVALID_REQUEST" }, 400);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > maxBodyLength) {
      return response({ error: "Invalid request", code: "INVALID_REQUEST" }, 400);
    }
    body = JSON.parse(text);
  } catch {
    return response({ error: "Invalid request", code: "INVALID_REQUEST" }, 400);
  }

  const input = parseBootstrapInput(body);
  if (!input) {
    return response({ error: "Invalid request", code: "INVALID_REQUEST" }, 400);
  }

  try {
    const passwordHash = await hashAuthPassword(input.password);
    if (input.replace) {
      const current = await getAuthAccount(input.role);
      if (!current) {
        return response({ error: "Account not found", code: "ACCOUNT_MISSING" }, 409);
      }
      const account = await replaceAuthAccountCredentials({
        role: input.role,
        username: input.username,
        passwordHash,
        expectedCredentialRevision: current.credentialRevision,
      });
      return response({
        status: "replaced",
        role: account.role,
        credentialRevision: account.credentialRevision,
      });
    }

    const account = await createAuthAccount({
      role: input.role,
      username: input.username,
      passwordHash,
    });
    return response(
      {
        status: "created",
        role: account.role,
        credentialRevision: account.credentialRevision,
      },
      201,
    );
  } catch (error) {
    if (error instanceof AuthAccountConflictError) {
      return response({ error: "Account already exists", code: "ACCOUNT_EXISTS" }, 409);
    }
    if (error instanceof AuthAccountStorageError) {
      return response({ error: "Storage unavailable", code: "STORAGE_UNAVAILABLE" }, 503);
    }
    return response({ error: "Bootstrap failed", code: "BOOTSTRAP_FAILED" }, 500);
  }
}

function parseBootstrapInput(value: unknown) {
  if (!isRecord(value)) return null;
  const role = value.role === "barista" || value.role === "admin" ? value.role : null;
  const username =
    typeof value.username === "string" ? normalizeAuthUsername(value.username) : null;
  const password = typeof value.password === "string" ? value.password : null;
  const replace = value.replace === true;
  const expectedConfirmation = `${replace ? "REPLACE" : "CREATE"} ${role ?? ""}`;
  if (
    !role ||
    !username ||
    !password ||
    password.length < 12 ||
    password.length > 1_024 ||
    value.confirmation !== expectedConfirmation
  ) {
    return null;
  }
  return { role: role as AuthRole, username, password, replace };
}

function getBearerToken(value: string | null) {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7);
  return token && !/\s/.test(token) ? token : null;
}

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: noStoreHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
