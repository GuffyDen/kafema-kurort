import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const load = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const redis = new Map();
const tenantId = `redis-test-${randomBytes(8).toString("hex")}`;

function read(key) {
  const entry = redis.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry;
  redis.delete(key);
  return undefined;
}

async function executeRedisCommand(command) {
  const operation = command[0];
  if (operation === "EVAL") {
    if (command[1].includes("credentialRevision")) {
      const key = command[3];
      const current = read(key);
      if (!current) return ["MISSING"];
      const account = JSON.parse(current.value);
      if (account.credentialRevision !== Number(command[7])) return ["CONFLICT"];
      account.username = command[4];
      account.passwordHash = command[5];
      account.updatedAt = command[6];
      account.credentialRevision += 1;
      const value = JSON.stringify(account);
      redis.set(key, { value, expiresAt: Number.POSITIVE_INFINITY });
      return ["UPDATED", value];
    }
    const key = command[3];
    const ttl = Number(command[4]);
    const current = read(key);
    const count = Number(current?.value ?? 0) + 1;
    const expiresAt = current?.expiresAt ?? Date.now() + ttl * 1_000;
    redis.set(key, { value: String(count), expiresAt });
    return [count, Math.max(1, Math.ceil((expiresAt - Date.now()) / 1_000))];
  }
  if (operation === "SET") {
    const [, key, value, mode, expiryMode, ttl] = command;
    if (mode === "NX" && read(key)) return null;
    const expiresAt = expiryMode === "EX"
      ? Date.now() + Number(ttl) * 1_000
      : Number.POSITIVE_INFINITY;
    redis.set(key, { value, expiresAt });
    return "OK";
  }
  if (operation === "GET") return read(command[1])?.value ?? null;
  if (operation === "DEL") return redis.delete(command[1]) ? 1 : 0;
  throw new Error(`Unexpected Redis command: ${operation}`);
}

const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === "server-only") return {};
  if (id === "@/lib/tenantSettingsStore") return { getTenantId: () => tenantId };
  if (id === "@/lib/storefrontStorage") {
    return {
      executeRedisCommand,
      getStorefrontPersistence: () => ({ mode: "redis", writable: true, warning: null }),
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

const accountRepository = load("../lib/serverAuthAccountRepository.ts");
const authModulePath = path.join(root, "lib/serverBaristaAuth.ts");
const auth = load(authModulePath);

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

test("production Redis commands atomically limit attempts and persist session revocation", async () => {
  const rateRequest = new Request("https://test.example/api/auth/barista/login", {
    headers: { "X-Vercel-Forwarded-For": "192.0.2.44" },
  });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await auth.consumeBaristaLoginAttempt(rateRequest)).allowed, true);
  }
  assert.equal((await auth.consumeBaristaLoginAttempt(rateRequest)).allowed, false);

  const account = await accountRepository.createAuthAccount({
    role: "barista",
    username: "barista",
    passwordHash: passwordHash("initial-password-not-real"),
  });
  const { token } = await auth.createBaristaSession(account);
  const sessionRecord = [...redis.entries()].find(([key]) =>
    key.includes(":barista-session:v1:"),
  )?.[1]?.value;
  assert.ok(sessionRecord);
  assert.doesNotMatch(sessionRecord, /initial-password-not-real/);
  assert.equal(sessionRecord.includes(account.passwordHash), false);
  const request = new Request("https://test.example/api/bar/orders", {
    headers: { Cookie: `tablo_barista_session=${token}` },
  });
  assert.equal((await auth.authorizeBaristaRequest(request)).ok, true);
  await auth.destroyBaristaSession(request);
  assert.equal((await auth.authorizeBaristaRequest(request)).ok, false);
});

test("Redis account changes credentials, invalidates revisions and survives module restart", async () => {
  const initial = await accountRepository.getAuthAccount("barista");
  assert.equal(initial.role, "barista");
  assert.equal(initial.username, "barista");
  const stored = read(accountRepository.getAuthAccountRedisKey(tenantId, "barista")).value;
  assert.doesNotMatch(stored, /initial-password-not-real/);
  assert.equal(
    (await auth.authenticateBaristaCredentials("barista", "initial-password-not-real")).role,
    "barista",
  );
  assert.equal(await auth.authenticateBaristaCredentials("wrong", "initial-password-not-real"), false);
  assert.equal(await auth.authenticateBaristaCredentials("barista", "wrong-password"), false);

  const oldSession = await auth.createBaristaSession(initial);
  const oldRequest = new Request("https://test.example/api/bar/orders", {
    headers: { Cookie: `tablo_barista_session=${oldSession.token}` },
  });
  const updated = await accountRepository.replaceAuthAccountCredentials({
    role: "barista",
    username: "barista-new",
    passwordHash: passwordHash("replacement-password-not-real"),
    expectedCredentialRevision: initial.credentialRevision,
  });
  assert.equal(updated.credentialRevision, initial.credentialRevision + 1);
  assert.equal((await auth.authorizeBaristaRequest(oldRequest)).ok, false);
  assert.equal(await auth.authenticateBaristaCredentials("barista", "initial-password-not-real"), false);
  assert.equal(
    (await auth.authenticateBaristaCredentials("barista-new", "replacement-password-not-real")).credentialRevision,
    updated.credentialRevision,
  );

  const current = await accountRepository.getAuthAccount("barista");
  const newSession = await auth.createBaristaSession(current);
  const newRequest = new Request("https://test.example/api/bar/orders", {
    headers: { Cookie: `tablo_barista_session=${newSession.token}` },
  });
  delete load.cache[load.resolve(authModulePath)];
  const restartedAuth = load(authModulePath);
  assert.equal((await restartedAuth.authorizeBaristaRequest(newRequest)).ok, true);
});

test("shared account model supports admin and refuses implicit overwrite", async () => {
  assert.equal(await accountRepository.getAuthAccount("admin"), null);
  const admin = await accountRepository.createAuthAccount({
    role: "admin",
    username: "admin",
    passwordHash: passwordHash("admin-password-not-real"),
  });
  assert.equal(admin.role, "admin");
  assert.equal((await accountRepository.getAuthAccount("admin")).username, "admin");
  await assert.rejects(
    accountRepository.createAuthAccount({
      role: "admin",
      username: "other-admin",
      passwordHash: passwordHash("other-admin-password-not-real"),
    }),
    { name: "Error" },
  );
  assert.equal((await accountRepository.getAuthAccount("admin")).username, "admin");
});
