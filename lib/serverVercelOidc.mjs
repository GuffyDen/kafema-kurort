import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";

const remoteKeySets = new Map();

export async function verifyProductionProjectOidcToken(token, options = {}) {
  if (typeof token !== "string" || token.length < 100 || token.length > 16_384) {
    return false;
  }

  const projectId = options.projectId ?? process.env.VERCEL_PROJECT_ID;
  const runtimeEnvironment =
    options.runtimeEnvironment ?? process.env.VERCEL_ENV;
  if (!projectId || runtimeEnvironment !== "production") return false;

  try {
    const unverified = decodeJwt(token);
    const issuer = getAllowedIssuer(unverified.iss, unverified.owner);
    if (!issuer || typeof unverified.owner !== "string") return false;

    const audience = `https://vercel.com/${unverified.owner}`;
    const keySet = options.keySet ?? getRemoteKeySet(issuer);
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ["RS256"],
      issuer,
      audience,
    });

    const tokenEnvironment = payload.environment;
    const allowedEnvironment =
      tokenEnvironment === "production" ||
      (tokenEnvironment === "development" &&
        typeof payload.user_id === "string" &&
        payload.user_id.length > 0);
    if (
      payload.project_id !== projectId ||
      !allowedEnvironment ||
      typeof payload.owner !== "string" ||
      typeof payload.project !== "string"
    ) {
      return false;
    }

    return (
      payload.sub ===
      `owner:${payload.owner}:project:${payload.project}:environment:${tokenEnvironment}`
    );
  } catch {
    return false;
  }
}

function getAllowedIssuer(value, owner) {
  if (
    typeof value !== "string" ||
    typeof owner !== "string" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(owner)
  ) {
    return null;
  }

  if (value === "https://oidc.vercel.com") return value;
  return value === `https://oidc.vercel.com/${owner}` ? value : null;
}

function getRemoteKeySet(issuer) {
  let keySet = remoteKeySets.get(issuer);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
    remoteKeySets.set(issuer, keySet);
  }
  return keySet;
}
