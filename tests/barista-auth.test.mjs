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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tablo-barista-auth-"));
const fixtureTenantId = `test-tenant-${randomBytes(8).toString("hex")}`;
process.chdir(temp);
process.env.NODE_ENV = "test";
for (const key of [
  "REDIS_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
]) delete process.env[key];
if (process.env.TABLO_TEST_REDIS_PORT) {
  assert.match(process.env.TABLO_TEST_REDIS_PORT, /^\d{4,5}$/);
  process.env.REDIS_URL = `redis://127.0.0.1:${process.env.TABLO_TEST_REDIS_PORT}`;
}

const fixtureUsername = "barista-fixture";
const fixturePassword = "fixture-password-not-real";
const salt = randomBytes(16);
const cost = 32_768;
const digest = scryptSync(fixturePassword, salt, 32, {
  N: cost,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024,
});
delete process.env.BARISTA_USERNAME;
delete process.env.BARISTA_PASSWORD_HASH;
const fixturePasswordHash =
  `scrypt$${cost}$8$1$${salt.toString("base64url")}$${digest.toString("base64url")}`;
let fixtureAccount = {
  role: "barista",
  username: fixtureUsername,
  passwordHash: fixturePasswordHash,
  credentialRevision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function normalizeUsername(value) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) ? normalized : null;
}

const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === "server-only") return {};
  if (id === "next/server") return { after: () => undefined };
  if (id === "@/lib/tenantSettingsStore") return { getTenantId: () => fixtureTenantId };
  if (id === "@/lib/serverAuthAccountRepository") {
    return {
      getAuthAccount: async (role) => fixtureAccount?.role === role ? fixtureAccount : null,
      isSupportedPasswordHash: (value) => /^scrypt\$/.test(value),
      normalizeAuthUsername: normalizeUsername,
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

const loginRoute = load("../app/api/auth/barista/login/route.ts");
const logoutRoute = load("../app/api/auth/barista/logout/route.ts");
const ordersRoute = load("../app/api/bar/orders/route.ts");
const baristaAuth = load("../lib/serverBaristaAuth.ts");

after(() => fs.rmSync(temp, { recursive: true, force: true }));

function login(body, ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`) {
  return loginRoute.POST(
    new Request("https://test.example/api/auth/barista/login", {
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

test("successful login creates an opaque protected session cookie", async () => {
  const response = await login({ username: fixtureUsername, password: fixturePassword });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /^tablo_barista_session=[A-Za-z0-9_-]{43};/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Max-Age=43200/);
  assert.doesNotMatch(setCookie, new RegExp(fixtureUsername, "i"));
  assert.doesNotMatch(setCookie, new RegExp(fixturePassword, "i"));
});

test("session cookie is Secure in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.match(baristaAuth.serializeBaristaSessionCookie("a".repeat(43)), /; Secure$/);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("wrong and missing credentials return neutral failures", async () => {
  const wrongUsername = await login({ username: "someone-else", password: fixturePassword });
  assert.equal(wrongUsername.status, 401);
  assert.equal((await wrongUsername.json()).code, "INVALID_CREDENTIALS");
  const wrongPassword = await login({ username: fixtureUsername, password: "wrong-password" });
  assert.equal(wrongPassword.status, 401);
  assert.equal((await wrongPassword.json()).code, "INVALID_CREDENTIALS");
  const missing = await login({ username: fixtureUsername });
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).code, "INVALID_CREDENTIALS");
});

test("runtime login does not require credential ENV variables", async () => {
  assert.equal(process.env.BARISTA_USERNAME, undefined);
  assert.equal(process.env.BARISTA_PASSWORD_HASH, undefined);
  assert.equal(
    (await login({ username: fixtureUsername, password: fixturePassword })).status,
    200,
  );
});

test("missing Redis account is handled without exposing account details", async () => {
  const account = fixtureAccount;
  fixtureAccount = null;
  try {
    const response = await login({ username: fixtureUsername, password: fixturePassword });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Неверный логин или пароль.",
      code: "INVALID_CREDENTIALS",
    });
  } finally {
    fixtureAccount = account;
  }
});

test("login requires same-origin requests", async () => {
  const response = await loginRoute.POST(
    new Request("https://test.example/api/auth/barista/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify({ username: fixtureUsername, password: fixturePassword }),
    }),
  );
  assert.equal(response.status, 403);
});

test("Redis-compatible rate limiting temporarily blocks repeated failures", async () => {
  const ip = "192.0.2.250";
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

test("bar APIs reject missing, legacy bearer and forged cookie auth", async () => {
  assert.equal(
    (await ordersRoute.GET(new Request("https://test.example/api/bar/orders"))).status,
    401,
  );
  assert.equal(
    (
      await ordersRoute.GET(
        new Request("https://test.example/api/bar/orders", {
          headers: { Authorization: "Bearer legacy-static-token" },
        }),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await ordersRoute.GET(
        new Request("https://test.example/api/bar/orders", {
          headers: { Cookie: `tablo_barista_session=${"a".repeat(43)}` },
        }),
      )
    ).status,
    401,
  );
});

test("authenticated bar API works and logout invalidates the server session", async () => {
  const loginResponse = await login(
    { username: fixtureUsername, password: fixturePassword },
    "192.0.2.210",
  );
  const cookie = cookieFrom(loginResponse);
  assert.ok(cookie);
  assert.equal(
    (
      await ordersRoute.GET(
        new Request("https://test.example/api/bar/orders", {
          headers: { Cookie: cookie },
        }),
      )
    ).status,
    200,
  );

  const logoutResponse = await logoutRoute.POST(
    new Request("https://test.example/api/auth/barista/logout", {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://test.example" },
    }),
  );
  assert.equal(logoutResponse.status, 200);
  assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(
    (
      await ordersRoute.GET(
        new Request("https://test.example/api/bar/orders", {
          headers: { Cookie: cookie },
        }),
      )
    ).status,
    401,
  );
});

test("credential revision invalidates old sessions and a new login creates a valid one", async () => {
  const firstLogin = await login(
    { username: fixtureUsername, password: fixturePassword },
    "192.0.2.211",
  );
  const oldCookie = cookieFrom(firstLogin);
  fixtureAccount = {
    ...fixtureAccount,
    credentialRevision: fixtureAccount.credentialRevision + 1,
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  assert.equal(
    (
      await ordersRoute.GET(
        new Request("https://test.example/api/bar/orders", {
          headers: { Cookie: oldCookie },
        }),
      )
    ).status,
    401,
  );
  const nextLogin = await login(
    { username: fixtureUsername, password: fixturePassword },
    "192.0.2.212",
  );
  assert.equal(nextLogin.status, 200);
  assert.equal(
    (
      await ordersRoute.GET(
        new Request("https://test.example/api/bar/orders", {
          headers: { Cookie: cookieFrom(nextLogin) },
        }),
      )
    ).status,
    200,
  );
});

test("client modules contain no Barista credentials or server auth imports", () => {
  const clientSources = [
    "components/admin/AdminPanel.tsx",
    "components/bar/BaristaLogin.tsx",
    "lib/orderStore.ts",
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(clientSources, /BARISTA_(?:USERNAME|PASSWORD_HASH|ACCESS_TOKEN)/);
  assert.doesNotMatch(clientSources, /serverBaristaAuth/);
  assert.doesNotMatch(clientSources, /sessionStorage/);
});
