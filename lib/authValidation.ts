export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_LENGTH = 1_024;

export function normalizeAuthUsername(value: string) {
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) ? normalized : null;
}

export function isValidAuthPassword(value: string) {
  return (
    value.length >= AUTH_PASSWORD_MIN_LENGTH &&
    value.length <= AUTH_PASSWORD_MAX_LENGTH
  );
}
