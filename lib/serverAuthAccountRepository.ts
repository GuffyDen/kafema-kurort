import "server-only";

import { normalizeAuthUsername } from "@/lib/authValidation";
import { getTenantId } from "@/lib/tenantSettingsStore";
import {
  executeRedisCommand,
  getStorefrontPersistence,
} from "@/lib/storefrontStorage";

export type AuthRole = "barista" | "admin";

export type AuthAccount = {
  role: AuthRole;
  username: string;
  passwordHash: string;
  credentialRevision: number;
  createdAt: string;
  updatedAt: string;
};

export class AuthAccountStorageError extends Error {}
export class AuthAccountConflictError extends Error {}

export async function getAuthAccount(role: AuthRole) {
  assertRedisPersistence();
  try {
    const value = await executeRedisCommand([
      "GET",
      getAuthAccountRedisKey(getTenantId(), role),
    ]);
    if (value === null) return null;
    const account = typeof value === "string" ? parseAuthAccount(value) : null;
    if (!account || account.role !== role) {
      throw new AuthAccountStorageError("Auth account data is invalid.");
    }
    return account;
  } catch (error) {
    if (error instanceof AuthAccountStorageError) throw error;
    throw new AuthAccountStorageError("Auth account storage is unavailable.");
  }
}

export async function createAuthAccount(input: {
  role: AuthRole;
  username: string;
  passwordHash: string;
  now?: string;
}) {
  assertRedisPersistence();
  const now = input.now ?? new Date().toISOString();
  const account = normalizeAuthAccount({
    role: input.role,
    username: input.username,
    passwordHash: input.passwordHash,
    credentialRevision: 1,
    createdAt: now,
    updatedAt: now,
  });
  if (!account) throw new AuthAccountStorageError("Auth account input is invalid.");

  try {
    const result = await executeRedisCommand([
      "SET",
      getAuthAccountRedisKey(getTenantId(), input.role),
      JSON.stringify(account),
      "NX",
    ]);
    if (result !== "OK") {
      throw new AuthAccountConflictError("Auth account already exists.");
    }
    return account;
  } catch (error) {
    if (error instanceof AuthAccountConflictError) throw error;
    throw new AuthAccountStorageError("Auth account storage is unavailable.");
  }
}

export async function replaceAuthAccountCredentials(input: {
  role: AuthRole;
  username: string;
  passwordHash: string;
  expectedCredentialRevision: number;
  now?: string;
}) {
  assertRedisPersistence();
  const username = normalizeAuthUsername(input.username);
  if (
    !username ||
    !isSupportedPasswordHash(input.passwordHash) ||
    !Number.isSafeInteger(input.expectedCredentialRevision) ||
    input.expectedCredentialRevision < 1
  ) {
    throw new AuthAccountStorageError("Auth account input is invalid.");
  }

  const script = [
    "local raw = redis.call('GET', KEYS[1])",
    "if not raw then return {'MISSING'} end",
    "local current = cjson.decode(raw)",
    "if tonumber(current.credentialRevision) ~= tonumber(ARGV[4]) then return {'CONFLICT'} end",
    "current.username = ARGV[1]",
    "current.passwordHash = ARGV[2]",
    "current.updatedAt = ARGV[3]",
    "current.credentialRevision = tonumber(current.credentialRevision) + 1",
    "local updated = cjson.encode(current)",
    "redis.call('SET', KEYS[1], updated)",
    "return {'UPDATED', updated}",
  ].join("\n");

  try {
    const result = await executeRedisCommand([
      "EVAL",
      script,
      "1",
      getAuthAccountRedisKey(getTenantId(), input.role),
      username,
      input.passwordHash,
      input.now ?? new Date().toISOString(),
      String(input.expectedCredentialRevision),
    ]);
    const values = Array.isArray(result) ? result : [];
    if (values[0] === "MISSING" || values[0] === "CONFLICT") {
      throw new AuthAccountConflictError("Auth account changed concurrently.");
    }
    const account =
      values[0] === "UPDATED" && typeof values[1] === "string"
        ? parseAuthAccount(values[1])
        : null;
    if (!account || account.role !== input.role) {
      throw new AuthAccountStorageError("Auth account update is invalid.");
    }
    return account;
  } catch (error) {
    if (
      error instanceof AuthAccountConflictError ||
      error instanceof AuthAccountStorageError
    ) {
      throw error;
    }
    throw new AuthAccountStorageError("Auth account storage is unavailable.");
  }
}

export function getAuthAccountRedisKey(tenantId: string, role: AuthRole) {
  return `tablo:tenant:${tenantId}:auth-account:v1:${role}`;
}

export { normalizeAuthUsername } from "@/lib/authValidation";

export function isSupportedPasswordHash(value: string) {
  const parts = value.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [cost, blockSize, parallelization] = parts.slice(1, 4).map(Number);
  if (
    !Number.isInteger(cost) ||
    cost < 32_768 ||
    cost > 1_048_576 ||
    (cost & (cost - 1)) !== 0 ||
    !Number.isInteger(blockSize) ||
    blockSize < 8 ||
    blockSize > 32 ||
    !Number.isInteger(parallelization) ||
    parallelization < 1 ||
    parallelization > 8 ||
    !/^[A-Za-z0-9_-]{22,}$/.test(parts[4]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[5])
  ) {
    return false;
  }
  return (
    Buffer.from(parts[4], "base64url").length >= 16 &&
    Buffer.from(parts[5], "base64url").length === 32
  );
}

function parseAuthAccount(value: string) {
  try {
    return normalizeAuthAccount(JSON.parse(value));
  } catch {
    return null;
  }
}

function normalizeAuthAccount(value: unknown): AuthAccount | null {
  if (!isRecord(value) || (value.role !== "barista" && value.role !== "admin")) {
    return null;
  }
  const username =
    typeof value.username === "string" ? normalizeAuthUsername(value.username) : null;
  if (
    !username ||
    typeof value.passwordHash !== "string" ||
    !isSupportedPasswordHash(value.passwordHash) ||
    !Number.isSafeInteger(value.credentialRevision) ||
    Number(value.credentialRevision) < 1 ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return null;
  }
  return {
    role: value.role,
    username,
    passwordHash: value.passwordHash,
    credentialRevision: Number(value.credentialRevision),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function assertRedisPersistence() {
  if (getStorefrontPersistence().mode !== "redis") {
    throw new AuthAccountStorageError("Redis is required for auth accounts.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
