// Existing checkout accepts Russian numbers; keep the server contract explicit.
export function normalizeOrderPhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const text = value.trim();
  if (!/^\+?[\d\s()-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+") && !/^7\d{10}$/.test(digits)) return null;
  const national = digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits;
  return /^\d{10}$/.test(national) ? `+7${national}` : null;
}
