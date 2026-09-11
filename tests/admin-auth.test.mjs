import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const load = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tablo-admin-auth-"));
const tenantId = `test-tenant-${randomBytes(8).toString("hex")}`;
process.chdir(temp);
process.env.NODE_ENV = "test";

const fixtureUsername = "admin-fixture";
const fixturePassword = "fixture-admin-password-not-real";

function passwordHash(password) {
  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 32, {
    N: 32_768,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

const accounts = {
  admin: {
    role: "admin",
    username: fixtureUsername,
    passwordHash: passwordHash(fixturePassword),
    credentialRevision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  barista: {
    role: "barista",
    username: "barista-fixture",
    passwordHash: passwordHash("fixture-barista-password-not-real"),
    credentialRevision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};
let storefrontSyncCalls = 0;

function normalizeUsername(value) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) ? normalized : null;
}

const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === "server-only") return {};
  if (id === "@/lib/tenantSettingsStore") return { getTenantId: () => tenantId };
  if (id === "@/lib/serverAuthAccountRepository") {
    return {
      getAuthAccount: async (role) => accounts[role] ?? null,
      isSupportedPasswordHash: (value) => /^scrypt\$/.test(value),
      normalizeAuthUsername: normalizeUsername,
    };
  }
  if (id === "@/lib/storefrontAdminService") {
    return { getAdminStorefront: async () => ({ ok: true, products: [] }) };
  }
  if (id === "@/lib/storefrontService") {
    return { syncStorefrontMenu: async () => { storefrontSyncCalls += 1; } };
  }
  if (id === "@/lib/storefrontApiResponse") {
    return {
      storefrontErrorResponse: () =>
        Response.json({ error: "storefront failed" }, { status: 500 }),
    };
  }
  if (id.startsWith("@/")) id = path.join(root, id.slice(2)) + ".ts";
  return originalLoad.call(this, id, parent, main);
};
Module._extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );

const loginRoute = load("../app/api/auth/admin/login/route.ts");
const logoutRoute = load("../app/api/auth/admin/logout/route.ts");
const adminAuth = load("../lib/serverAdminAuth.ts");
const baristaAuth = load("../lib/serverBaristaAuth.ts");
const adminRoute = load("../lib/serverAdminRoute.ts");
const storefrontRoute = load("../app/api/admin/storefront/route.ts");
const storefrontSyncRoute = load("../app/api/admin/storefront/sync/route.ts");

after(() => fs.rmSync(temp, { recursive: true, force: true }));

function login(body, ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`) {
  return loginRoute.POST(
    new Request("https://test.example/api/auth/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://test.example",
        "X-Forwarded-For": ip,
      },
      body: JSON.stringify(body),
    }),
  );
}

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("Admin login creates an opaque role-bound session", async () => {
  const response = await login({ username: fixtureUsername, password: fixturePassword });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /^tablo_admin_session=[A-Za-z0-9_-]{43};/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Max-Age=43200/);
  assert.doesNotMatch(setCookie, new RegExp(fixtureUsername, "i"));
  assert.doesNotMatch(setCookie, new RegExp(fixturePassword, "i"));
});

test("Admin session cookie is Secure in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.match(adminAuth.serializeAdminSessionCookie("a".repeat(43)), /; Secure$/);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("Admin login rejects wrong username, wrong password and a missing account neutrally", async () => {
  for (const body of [
    { username: "someone-else", password: fixturePassword },
    { username: fixtureUsername, password: "wrong-password" },
  ]) {
    const response = await login(body);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Неверный логин или пароль.",
      code: "INVALID_CREDENTIALS",
    });
  }

  const account = accounts.admin;
  accounts.admin = null;
  try {
    const response = await login({ username: fixtureUsername, password: fixturePassword });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "INVALID_CREDENTIALS");
  } finally {
    accounts.admin = account;
  }
});

test("Admin login requires same-origin and has a role-specific rate limit", async () => {
  const crossOrigin = await loginRoute.POST(
    new Request("https://test.example/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({ username: fixtureUsername, password: fixturePassword }),
    }),
  );
  assert.equal(crossOrigin.status, 403);

  const ip = "198.51.100.250";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(
      (await login({ username: fixtureUsername, password: "wrong-password" }, ip)).status,
      401,
    );
  }
  const limited = await login({ username: fixtureUsername, password: fixturePassword }, ip);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});

test("Admin authorization rejects missing, forged and Barista sessions", async () => {
  const missing = await adminRoute.rejectUnauthorizedAdminRequest(
    new Request("https://test.example/api/admin/storefront"),
  );
  assert.equal(missing.status, 401);

  const forged = await adminRoute.rejectUnauthorizedAdminRequest(
    new Request("https://test.example/api/admin/storefront", {
      headers: { Cookie: `tablo_admin_session=${"a".repeat(43)}` },
    }),
  );
  assert.equal(forged.status, 401);

  const { token: baristaToken } = await baristaAuth.createBaristaSession(accounts.barista);
  const baristaOnly = await adminRoute.rejectUnauthorizedAdminRequest(
    new Request("https://test.example/api/admin/storefront", {
      headers: { Cookie: `tablo_barista_session=${baristaToken}` },
    }),
  );
  assert.equal(baristaOnly.status, 401);
});

test("Admin session authorizes reads, enforces Origin on writes and logout revokes it", async () => {
  const response = await login(
    { username: fixtureUsername, password: fixturePassword },
    "198.51.100.210",
  );
  const cookie = cookieFrom(response);
  assert.ok(cookie);

  assert.equal(
    await adminRoute.rejectUnauthorizedAdminRequest(
      new Request("https://test.example/api/admin/storefront", {
        headers: { Cookie: cookie },
      }),
    ),
    null,
  );
  const crossOriginWrite = await adminRoute.rejectUnauthorizedAdminRequest(
    new Request("https://test.example/api/admin/storefront/sync", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://attacker.example" },
    }),
    { requireSameOrigin: true },
  );
  assert.equal(crossOriginWrite.status, 403);

  const logout = await logoutRoute.POST(
    new Request("https://test.example/api/auth/admin/logout", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://test.example" },
    }),
  );
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (
      await adminRoute.rejectUnauthorizedAdminRequest(
        new Request("https://test.example/api/admin/storefront", {
          headers: { Cookie: cookie },
        }),
      )
    ).status,
    401,
  );
});

test("actual Admin read/write routes enforce session and write Origin", async () => {
  assert.equal(
    (await storefrontRoute.GET(new Request("https://test.example/api/admin/storefront"))).status,
    401,
  );
  const { token } = await adminAuth.createAdminSession(accounts.admin);
  const cookie = `tablo_admin_session=${token}`;
  const read = await storefrontRoute.GET(
    new Request("https://test.example/api/admin/storefront", {
      headers: { Cookie: cookie },
    }),
  );
  assert.equal(read.status, 200);

  storefrontSyncCalls = 0;
  const rejectedWrite = await storefrontSyncRoute.POST(
    new Request("https://test.example/api/admin/storefront/sync", {
      method: "POST",
      headers: { Cookie: cookie },
    }),
  );
  assert.equal(rejectedWrite.status, 403);
  assert.equal(storefrontSyncCalls, 0);

  const acceptedWrite = await storefrontSyncRoute.POST(
    new Request("https://test.example/api/admin/storefront/sync", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://test.example" },
    }),
  );
  assert.equal(acceptedWrite.status, 200);
  assert.equal(storefrontSyncCalls, 1);
});

test("credentialRevision invalidates an old Admin session", async () => {
  const { token } = await adminAuth.createAdminSession(accounts.admin);
  const request = new Request("https://test.example/api/admin/storefront", {
    headers: { Cookie: `tablo_admin_session=${token}` },
  });
  assert.equal((await adminAuth.authorizeAdminRequest(request)).ok, true);
  accounts.admin = {
    ...accounts.admin,
    credentialRevision: accounts.admin.credentialRevision + 1,
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  assert.equal((await adminAuth.authorizeAdminRequest(request)).ok, false);
});

test("every Admin HTTP entry point uses server-side Admin authorization", () => {
  const routes = [
    ["app/api/admin/settings/qr/route.ts", 2, 1],
    ["app/api/admin/settings/qr/table-stand/route.ts", 2, 2],
    ["app/api/admin/settings/qr/table-stand/upload/route.ts", 1, 1],
    ["app/api/admin/storefront/route.ts", 1, 0],
    ["app/api/admin/storefront/sync/route.ts", 1, 1],
    ["app/api/admin/storefront/categories/[categoryId]/route.ts", 1, 1],
    ["app/api/admin/storefront/categories/order/route.ts", 1, 1],
    ["app/api/admin/storefront/products/[itemId]/route.ts", 1, 1],
    ["app/api/admin/storefront/products/[itemId]/overrides/route.ts", 1, 1],
    ["app/api/iiko/check/route.ts", 2, 1],
    ["app/api/iiko/webhook-monitor/route.ts", 2, 1],
  ];

  let handlerCount = 0;
  for (const [file, expectedHandlers, expectedOriginChecks] of routes) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const handlers = source.match(/export async function (?:GET|POST|PATCH|DELETE)\(/g) ?? [];
    const checks = source.match(/await rejectUnauthorizedAdminRequest\(/g) ?? [];
    assert.equal(handlers.length, expectedHandlers, `${file} handler inventory changed`);
    assert.equal(checks.length, expectedHandlers, `${file} is missing an auth check`);
    const originChecks = source.match(/requireSameOrigin: true/g) ?? [];
    assert.equal(
      originChecks.length,
      expectedOriginChecks,
      `${file} has an incomplete write Origin policy`,
    );
    handlerCount += handlers.length;
  }
  assert.equal(handlerCount, 15);
});

test("Admin client code contains no credentials, auth storage or server secrets", () => {
  const files = [
    "components/manage/AdminLogin.tsx",
    "components/manage/ManagePanel.tsx",
    "components/manage/StorefrontSection.tsx",
    "components/manage/QrSection.tsx",
    "components/manage/TableStandEditor.tsx",
  ];
  const source = files
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    source,
    /(?:REDIS_URL|IIKO_API_KEY|IIKO_CLIENT_SECRET|YOOKASSA_SECRET_KEY|YOOKASSA_CRON_SECRET|CRON_SECRET)/,
  );
  assert.doesNotMatch(source, /server(?:Admin|Barista|AuthAccount)Auth/);
  assert.doesNotMatch(source, /passwordHash|sessionStorage/);
});

test("production bootstrap exposes an explicit Admin command without changing Barista", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts["auth:bootstrap:production"], /--role=barista$/);
  assert.match(pkg.scripts["auth:bootstrap:admin:production"], /--role=admin$/);
});
