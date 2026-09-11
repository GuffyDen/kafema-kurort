import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { verifyProductionProjectOidcToken } from "../lib/serverVercelOidc.mjs";

const owner = "test-owner";
const project = "test-project";
const projectId = "prj_test_target";
const issuer = `https://oidc.vercel.com/${owner}`;
const audience = `https://vercel.com/${owner}`;

async function createFixtureToken(overrides = {}) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "RS256";
  const claims = {
    owner,
    project,
    project_id: projectId,
    environment: "production",
    ...overrides,
  };
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(
      `owner:${claims.owner}:project:${claims.project}:environment:${claims.environment}`,
    )
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  return { token, keySet: createLocalJWKSet({ keys: [publicJwk] }) };
}

test("bootstrap OIDC accepts only a signed token for this production project", async () => {
  const { token, keySet } = await createFixtureToken();
  assert.equal(
    await verifyProductionProjectOidcToken(token, {
      projectId,
      runtimeEnvironment: "production",
      keySet,
    }),
    true,
  );
  assert.equal(
    await verifyProductionProjectOidcToken(token, {
      projectId: "prj_another_project",
      runtimeEnvironment: "production",
      keySet,
    }),
    false,
  );
  assert.equal(
    await verifyProductionProjectOidcToken(token, {
      projectId,
      runtimeEnvironment: "preview",
      keySet,
    }),
    false,
  );
});

test("bootstrap OIDC accepts a project-scoped local user token", async () => {
  const development = await createFixtureToken({
    environment: "development",
    user_id: "user_test_owner",
  });
  assert.equal(
    await verifyProductionProjectOidcToken(development.token, {
      projectId,
      runtimeEnvironment: "production",
      keySet: development.keySet,
    }),
    true,
  );

  const missingUser = await createFixtureToken({ environment: "development" });
  assert.equal(
    await verifyProductionProjectOidcToken(missingUser.token, {
      projectId,
      runtimeEnvironment: "production",
      keySet: missingUser.keySet,
    }),
    false,
  );
});

test("bootstrap OIDC rejects preview and a changed token", async () => {
  const preview = await createFixtureToken({ environment: "preview" });
  assert.equal(
    await verifyProductionProjectOidcToken(preview.token, {
      projectId,
      runtimeEnvironment: "production",
      keySet: preview.keySet,
    }),
    false,
  );

  const valid = await createFixtureToken();
  const [header, payload, signature] = valid.token.split(".");
  const changedSignature = `${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
  const changed = `${header}.${payload}.${changedSignature}`;
  assert.equal(
    await verifyProductionProjectOidcToken(changed, {
      projectId,
      runtimeEnvironment: "production",
      keySet: valid.keySet,
    }),
    false,
  );
});

test("bootstrap route is OIDC protected and never accepts REDIS_URL from input", async () => {
  const route = await readFile(
    new URL("../app/api/internal/auth/bootstrap/route.ts", import.meta.url),
    "utf8",
  );
  const cli = await readFile(
    new URL("../scripts/bootstrap-auth-account.mjs", import.meta.url),
    "utf8",
  );
  assert.match(route, /verifyProductionProjectOidcToken/);
  assert.match(route, /createAuthAccount/);
  assert.match(route, /hashAuthPassword/);
  assert.doesNotMatch(route, /body\.REDIS_URL|body\.redisUrl/);
  assert.doesNotMatch(route, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(cli, /Production REDIS_URL/);
});
