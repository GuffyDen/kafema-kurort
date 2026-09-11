import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bootstrapAuthAccount,
  bootstrapAuthAccountViaVercel,
} from "../scripts/bootstrap-auth-account.mjs";

function createRedisFixture() {
  const values = new Map();
  return {
    values,
    async sendCommand(command) {
      if (command[0] === "SET") {
        const [, key, value, mode] = command;
        if (mode === "NX" && values.has(key)) return null;
        values.set(key, value);
        return "OK";
      }
      if (command[0] === "EVAL") {
        const key = command[3];
        const raw = values.get(key);
        if (!raw) return ["MISSING"];
        const account = JSON.parse(raw);
        account.role = command[4];
        account.username = command[5];
        account.passwordHash = command[6];
        account.updatedAt = command[7];
        account.credentialRevision += 1;
        values.set(key, JSON.stringify(account));
        return ["REPLACED", String(account.credentialRevision)];
      }
      throw new Error(`Unexpected command: ${command[0]}`);
    },
  };
}

test("bootstrap stores only a password hash and refuses an existing account", async () => {
  const redis = createRedisFixture();
  const input = {
    sendCommand: redis.sendCommand,
    tenantId: "bootstrap-tenant",
    role: "barista",
    username: "Barista",
    password: "bootstrap-password-not-real",
    now: "2026-01-01T00:00:00.000Z",
  };
  const created = await bootstrapAuthAccount(input);
  assert.deepEqual(created, {
    status: "created",
    role: "barista",
    credentialRevision: 1,
  });
  const key = "tablo:tenant:bootstrap-tenant:auth-account:v1:barista";
  const stored = redis.values.get(key);
  const account = JSON.parse(stored);
  assert.equal(account.username, "barista");
  assert.match(account.passwordHash, /^scrypt\$65536\$8\$1\$/);
  assert.doesNotMatch(stored, /bootstrap-password-not-real/);

  const duplicate = await bootstrapAuthAccount({
    ...input,
    password: "different-password-not-real",
  });
  assert.deepEqual(duplicate, { status: "exists", role: "barista" });
  assert.equal(redis.values.get(key), stored);
});

test("bootstrap supports admin and requires an explicit replace path", async () => {
  const redis = createRedisFixture();
  const base = {
    sendCommand: redis.sendCommand,
    tenantId: "bootstrap-tenant",
    role: "admin",
    username: "admin",
    password: "admin-bootstrap-password-not-real",
    now: "2026-01-01T00:00:00.000Z",
  };
  assert.equal((await bootstrapAuthAccount(base)).status, "created");
  assert.deepEqual(await bootstrapAuthAccount(base), {
    status: "exists",
    role: "admin",
  });
  const replacement = await bootstrapAuthAccount({
    ...base,
    username: "admin-new",
    password: "replacement-admin-password-not-real",
    replace: true,
    now: "2026-01-02T00:00:00.000Z",
  });
  assert.deepEqual(replacement, {
    status: "replaced",
    role: "admin",
    credentialRevision: 2,
  });
  const stored = redis.values.get(
    "tablo:tenant:bootstrap-tenant:auth-account:v1:admin",
  );
  assert.equal(JSON.parse(stored).username, "admin-new");
  assert.doesNotMatch(stored, /replacement-admin-password-not-real/);
});

test("production bootstrap sends credentials through OIDC without a Redis URL", async () => {
  let request;
  const result = await bootstrapAuthAccountViaVercel({
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json(
        { status: "created", role: "barista", credentialRevision: 1 },
        { status: 201 },
      );
    },
    productionUrl: "kafema-kurort.example",
    oidcToken: "short-lived-oidc-token",
    role: "barista",
    username: "barista",
    password: "remote-bootstrap-password-not-real",
    replace: false,
  });

  assert.deepEqual(result, {
    status: "created",
    role: "barista",
    credentialRevision: 1,
  });
  assert.equal(
    request.url,
    "https://kafema-kurort.example/api/internal/auth/bootstrap",
  );
  assert.equal(request.init.method, "POST");
  assert.equal(
    request.init.headers.Authorization,
    "Bearer short-lived-oidc-token",
  );
  assert.equal(request.init.redirect, "error");
  const body = JSON.parse(request.init.body);
  assert.deepEqual(body, {
    role: "barista",
    username: "barista",
    password: "remote-bootstrap-password-not-real",
    replace: false,
    confirmation: "CREATE barista",
  });
  assert.equal("redisUrl" in body, false);
  assert.equal("REDIS_URL" in body, false);
});

test("production bootstrap sends the explicit Admin role and confirmation", async () => {
  let request;
  const result = await bootstrapAuthAccountViaVercel({
    fetchImpl: async (url, init) => {
      request = { url, init };
      return Response.json(
        { status: "created", role: "admin", credentialRevision: 1 },
        { status: 201 },
      );
    },
    productionUrl: "kafema-kurort.example",
    oidcToken: "short-lived-oidc-token",
    role: "admin",
    username: "admin",
    password: "remote-admin-password-not-real",
    replace: false,
  });

  assert.equal(result.role, "admin");
  assert.deepEqual(JSON.parse(request.init.body), {
    role: "admin",
    username: "admin",
    password: "remote-admin-password-not-real",
    replace: false,
    confirmation: "CREATE admin",
  });
  assert.equal("REDIS_URL" in request.init.headers, false);
});

test("production bootstrap refuses a non-HTTPS destination", async () => {
  let called = false;
  await assert.rejects(
    bootstrapAuthAccountViaVercel({
      fetchImpl: async () => {
        called = true;
      },
      productionUrl: "http://kafema-kurort.example",
      oidcToken: "short-lived-oidc-token",
      role: "barista",
      username: "barista",
      password: "remote-bootstrap-password-not-real",
    }),
    /VERCEL_BOOTSTRAP_UNAVAILABLE/,
  );
  assert.equal(called, false);
});
