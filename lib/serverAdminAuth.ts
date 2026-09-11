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

export { AuthStorageError as AdminAuthStorageError };

export function authenticateAdminCredentials(username: string, password: string) {
  return authenticateCredentials("admin", username, password);
}

export function consumeAdminLoginAttempt(request: Request) {
  return consumeLoginAttempt("admin", request);
}

export function clearAdminLoginAttempts(key: string) {
  return clearLoginAttempts(key);
}

export function createAdminSession(account: AuthAccount) {
  return createSession("admin", account);
}

export function authorizeAdminRequest(request: Request) {
  return authorizeRequest("admin", request);
}

export function hasAdminSession(token: string | undefined) {
  return hasSession("admin", token);
}

export function destroyAdminSession(request: Request) {
  return destroySession("admin", request);
}

export function getAdminSessionCookieName() {
  return getSessionCookieName("admin");
}

export function serializeAdminSessionCookie(token: string) {
  return serializeSessionCookie("admin", token);
}

export function serializeExpiredAdminSessionCookie() {
  return serializeExpiredSessionCookie("admin");
}

export function isSameOriginAdminRequest(request: Request) {
  return isSameOriginRequest(request);
}
