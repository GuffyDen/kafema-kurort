import "server-only";

import type { AuthAccount } from "@/lib/serverAuthAccountRepository";
import {
  AuthStorageError,
  authenticateCredentials,
  authorizeRequest,
  clearLoginAttempts,
  consumeLoginAttempt,
  createSession,
  destroySession,
  getSessionCookieName,
  hasSession,
  isSameOriginRequest,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from "@/lib/serverAuth";

export { AuthStorageError as BaristaAuthStorageError };

export function authenticateBaristaCredentials(username: string, password: string) {
  return authenticateCredentials("barista", username, password);
}

export function consumeBaristaLoginAttempt(request: Request) {
  return consumeLoginAttempt("barista", request);
}

export function clearBaristaLoginAttempts(key: string) {
  return clearLoginAttempts(key);
}

export function createBaristaSession(account: AuthAccount) {
  return createSession("barista", account);
}

export function authorizeBaristaRequest(request: Request) {
  return authorizeRequest("barista", request);
}

export function hasBaristaSession(token: string | undefined) {
  return hasSession("barista", token);
}

export function destroyBaristaSession(request: Request) {
  return destroySession("barista", request);
}

export function getBaristaSessionCookieName() {
  return getSessionCookieName("barista");
}

export function serializeBaristaSessionCookie(token: string) {
  return serializeSessionCookie("barista", token);
}

export function serializeExpiredBaristaSessionCookie() {
  return serializeExpiredSessionCookie("barista");
}

export function isSameOriginBaristaRequest(request: Request) {
  return isSameOriginRequest(request);
}
