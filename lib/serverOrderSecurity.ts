import { createHash, timingSafeEqual } from "node:crypto";

export type BaristaAuthorizationResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

export function authorizeBaristaRequest(request: Request): BaristaAuthorizationResult {
  const configuredToken = process.env.BARISTA_ACCESS_TOKEN?.trim();

  if (!configuredToken || configuredToken.length < 32) {
    return {
      ok: false,
      status: 503,
      message: "Доступ бариста не настроен.",
    };
  }

  const providedToken = getBearerToken(request);
  if (!providedToken || !safeEqual(providedToken, configuredToken)) {
    return { ok: false, status: 401, message: "Требуется доступ бариста." };
  }

  return { ok: true };
}

export function getBearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

export function hashOrderAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyOrderAccessToken(token: string, expectedHash: string) {
  return safeEqual(hashOrderAccessToken(token), expectedHash);
}

function safeEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}
