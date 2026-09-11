import "server-only";

import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { getTenantId } from "@/lib/tenantSettingsStore";
import {
  getAuthAccount,
  isSupportedPasswordHash,
  normalizeAuthUsername,
  type AuthAccount,
  type AuthRole,
} from "@/lib/serverAuthAccountRepository";
import {
  executeRedisCommand,
  getStorefrontPersistence,
} from "@/lib/storefrontStorage";

const sessionLifetimeSeconds = 12 * 60 * 60;
const loginWindowSeconds = 15 * 60;
const maxLoginAttempts = 5;
const sessionVersion = 1;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

const roleSettings: Record<
  AuthRole,
  { cookieName: string; label: string; sessionKeySegment: string; rateKeySegment: string }
> = {
  barista: {
    cookieName: "tablo_barista_session",
    label: "бариста",
    sessionKeySegment: "barista-session",
    rateKeySegment: "barista-login-rate",
  },
  admin: {
    cookieName: "tablo_admin_session",
    label: "администратора",
    sessionKeySegment: "admin-session",
    rateKeySegment: "admin-login-rate",
  },
};

export type AuthSession<R extends AuthRole = AuthRole> = {
  role: R;
  version: typeof sessionVersion;
  tenantId: string;
  credentialRevision: number;
  expiresAt: number;
};

type PasswordHash = {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  digest: Buffer;
};

export type AuthorizationResult<R extends AuthRole> =
  | { ok: true; session: AuthSession<R> }
  | { ok: false; status: 401 | 503; message: string };

export type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  key: string;
};

const localSessions = new Map<string, { value: string; expiresAt: number }>();
const localLoginAttempts = new Map<string, { count: number; expiresAt: number }>();

export class AuthStorageError extends Error {}

export async function authenticateCredentials(
  role: AuthRole,
  username: string,
  password: string,
) {
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 128 ||
    password.length > 1_024
  ) {
    return false;
  }

  let account: AuthAccount | null;
  try {
    account = await getAuthAccount(role);
  } catch {
    throw new AuthStorageError("Auth account storage is unavailable.");
  }
  if (!account) return false;

  const normalizedUsername = normalizeAuthUsername(username);
  const passwordHash = parsePasswordHash(account.passwordHash);
  if (!normalizedUsername || !passwordHash) return false;
  const usernameMatches = safeEqualText(normalizedUsername, account.username);
  const derived = await deriveScrypt(password, passwordHash);
  const passwordMatches =
    derived.length === passwordHash.digest.length &&
    timingSafeEqual(derived, passwordHash.digest);

  return usernameMatches && passwordMatches ? account : false;
}

export async function consumeLoginAttempt(
  role: AuthRole,
  request: Request,
): Promise<LoginRateLimitResult> {
  const tenantId = getTenantId();
  const fingerprint = createHash("sha256")
    .update(getRequestClientAddress(request))
    .digest("hex");
  const key = `tablo:tenant:${tenantId}:${roleSettings[role].rateKeySegment}:v1:${fingerprint}`;
  const persistence = getStorefrontPersistence();

  try {
    let count: number;
    let retryAfterSeconds: number;

    if (persistence.mode === "redis") {
      const script = [
        "local count = redis.call('INCR', KEYS[1])",
        "if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
        "local ttl = redis.call('TTL', KEYS[1])",
        "return {count, ttl}",
      ].join("\n");
      const result = await executeRedisCommand([
        "EVAL",
        script,
        "1",
        key,
        String(loginWindowSeconds),
      ]);
      const values = Array.isArray(result) ? result : [];
      count = Number(values[0]);
      retryAfterSeconds = Math.max(1, Number(values[1]) || loginWindowSeconds);
    } else if (persistence.mode === "local-file") {
      const now = Date.now();
      const current = localLoginAttempts.get(key);
      const next =
        current && current.expiresAt > now
          ? { ...current, count: current.count + 1 }
          : { count: 1, expiresAt: now + loginWindowSeconds * 1_000 };
      localLoginAttempts.set(key, next);
      count = next.count;
      retryAfterSeconds = Math.max(1, Math.ceil((next.expiresAt - now) / 1_000));
    } else {
      throw new AuthStorageError("Auth storage is not configured.");
    }

    if (!Number.isFinite(count)) {
      throw new AuthStorageError("Invalid rate limit response.");
    }

    return {
      allowed: count <= maxLoginAttempts,
      retryAfterSeconds,
      key,
    };
  } catch (error) {
    if (error instanceof AuthStorageError) throw error;
    throw new AuthStorageError("Auth storage is unavailable.");
  }
}

export async function clearLoginAttempts(key: string) {
  const persistence = getStorefrontPersistence();
  try {
    if (persistence.mode === "redis") {
      await executeRedisCommand(["DEL", key]);
    } else if (persistence.mode === "local-file") {
      localLoginAttempts.delete(key);
    }
  } catch {
    // A successful login must not fail only because rate-limit cleanup failed.
  }
}

export async function createSession<R extends AuthRole>(
  role: R,
  account: AuthAccount,
) {
  if (account.role !== role) {
    throw new AuthStorageError(`An account with role ${role} is required.`);
  }
  const tenantId = getTenantId();
  const session: AuthSession<R> = {
    role,
    version: sessionVersion,
    tenantId,
    credentialRevision: account.credentialRevision,
    expiresAt: Date.now() + sessionLifetimeSeconds * 1_000,
  };
  const serialized = JSON.stringify(session);
  const persistence = getStorefrontPersistence();

  if (persistence.mode === "unconfigured") {
    throw new AuthStorageError("Auth storage is not configured.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomBytes(32).toString("base64url");
    const key = sessionKey(role, tenantId, token);
    try {
      if (persistence.mode === "redis") {
        const result = await executeRedisCommand([
          "SET",
          key,
          serialized,
          "NX",
          "EX",
          String(sessionLifetimeSeconds),
        ]);
        if (result !== "OK") continue;
      } else {
        if (localSessions.has(key)) continue;
        localSessions.set(key, { value: serialized, expiresAt: session.expiresAt });
      }
      return { token, session };
    } catch {
      throw new AuthStorageError("Auth storage is unavailable.");
    }
  }

  throw new AuthStorageError("Could not create a unique auth session.");
}

export async function authorizeRequest<R extends AuthRole>(
  role: R,
  request: Request,
): Promise<AuthorizationResult<R>> {
  const token = getSessionToken(role, request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      message: `Требуется вход ${roleSettings[role].label}.`,
    };
  }

  try {
    const session = await readSession(role, token);
    return session
      ? { ok: true, session }
      : {
          ok: false,
          status: 401,
          message: `Требуется вход ${roleSettings[role].label}.`,
        };
  } catch {
    return {
      ok: false,
      status: 503,
      message: "Авторизация временно недоступна.",
    };
  }
}

export async function hasSession<R extends AuthRole>(
  role: R,
  token: string | undefined,
) {
  if (!token) return false;
  try {
    return Boolean(await readSession(role, token));
  } catch {
    return false;
  }
}

export async function destroySession(role: AuthRole, request: Request) {
  const token = getSessionToken(role, request);
  if (!token) return;
  const tenantId = getTenantId();
  const key = sessionKey(role, tenantId, token);
  const persistence = getStorefrontPersistence();

  try {
    if (persistence.mode === "redis") {
      await executeRedisCommand(["DEL", key]);
    } else if (persistence.mode === "local-file") {
      localSessions.delete(key);
    } else {
      throw new AuthStorageError("Auth storage is not configured.");
    }
  } catch (error) {
    if (error instanceof AuthStorageError) throw error;
    throw new AuthStorageError("Auth storage is unavailable.");
  }
}

export function getSessionCookieName(role: AuthRole) {
  return roleSettings[role].cookieName;
}

export function serializeSessionCookie(role: AuthRole, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${getSessionCookieName(role)}=${token}; Path=/; Max-Age=${sessionLifetimeSeconds}; HttpOnly; SameSite=Strict${secure}`;
}

export function serializeExpiredSessionCookie(role: AuthRole) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${getSessionCookieName(role)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getSessionToken(role: AuthRole, request: Request) {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;

  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== getSessionCookieName(role)) continue;
    const token = part.slice(separator + 1).trim();
    return tokenPattern.test(token) ? token : null;
  }
  return null;
}

async function readSession<R extends AuthRole>(role: R, token: string) {
  if (!tokenPattern.test(token)) return null;
  const tenantId = getTenantId();
  const key = sessionKey(role, tenantId, token);
  const persistence = getStorefrontPersistence();
  let raw: string | null = null;

  try {
    if (persistence.mode === "redis") {
      const result = await executeRedisCommand(["GET", key]);
      raw = typeof result === "string" ? result : null;
    } else if (persistence.mode === "local-file") {
      const stored = localSessions.get(key);
      if (stored && stored.expiresAt > Date.now()) raw = stored.value;
      else if (stored) localSessions.delete(key);
    } else {
      throw new AuthStorageError("Auth storage is not configured.");
    }
  } catch (error) {
    if (error instanceof AuthStorageError) throw error;
    throw new AuthStorageError("Auth storage is unavailable.");
  }

  if (!raw) return null;
  const session = parseSession(role, raw);
  let account: AuthAccount | null = null;
  if (session && session.tenantId === tenantId && session.expiresAt > Date.now()) {
    try {
      account = await getAuthAccount(role);
    } catch {
      throw new AuthStorageError("Auth account storage is unavailable.");
    }
  }
  if (
    !session ||
    !account ||
    session.tenantId !== tenantId ||
    session.expiresAt <= Date.now() ||
    session.credentialRevision !== account.credentialRevision
  ) {
    try {
      if (persistence.mode === "redis") await executeRedisCommand(["DEL", key]);
      else localSessions.delete(key);
    } catch {
      // Invalid sessions remain unusable even if best-effort cleanup fails.
    }
    return null;
  }
  return session;
}

function parseSession<R extends AuthRole>(role: R, value: string) {
  try {
    const session = JSON.parse(value) as Partial<AuthSession<R>>;
    return session.role === role &&
      session.version === sessionVersion &&
      typeof session.tenantId === "string" &&
      Number.isSafeInteger(session.credentialRevision) &&
      Number(session.credentialRevision) >= 1 &&
      typeof session.expiresAt === "number"
      ? (session as AuthSession<R>)
      : null;
  } catch {
    return null;
  }
}

function sessionKey(role: AuthRole, tenantId: string, token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return `tablo:tenant:${tenantId}:${roleSettings[role].sessionKeySegment}:v1:${tokenHash}`;
}

function getRequestClientAddress(request: Request) {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function parsePasswordHash(value: string | undefined): PasswordHash | null {
  if (!value || !isSupportedPasswordHash(value)) return null;
  const parts = value.split("$");
  const [cost, blockSize, parallelization] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64url");
  const digest = Buffer.from(parts[5], "base64url");
  return { cost, blockSize, parallelization, salt, digest };
}

function deriveScrypt(password: string, hash: PasswordHash) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      hash.salt,
      hash.digest.length,
      {
        N: hash.cost,
        r: hash.blockSize,
        p: hash.parallelization,
        maxmem: Math.max(128 * 1024 * 1024, 256 * hash.cost * hash.blockSize),
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

function safeEqualText(first: string, second: string) {
  const firstHash = createHash("sha256").update(first).digest();
  const secondHash = createHash("sha256").update(second).digest();
  return timingSafeEqual(firstHash, secondHash);
}
