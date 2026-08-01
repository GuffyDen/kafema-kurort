export type QrTargetUrlValidation =
  | { ok: true; url: string; isLocal: boolean }
  | { ok: false; error: string };

const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validateQrTargetUrl(
  value: unknown,
  options: { allowLocalHttp: boolean },
): QrTargetUrlValidation {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: "Введите адрес клиентской витрины." };
  }

  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    return {
      ok: false,
      error: "Введите полный адрес, например https://example.com/menu.",
    };
  }

  const isLocal = localHostnames.has(url.hostname);

  if (url.protocol === "https:") {
    if (isLocal && !options.allowLocalHttp) {
      return {
        ok: false,
        error: "Локальный адрес нельзя использовать в production.",
      };
    }

    return { ok: true, url: url.toString(), isLocal };
  }

  if (url.protocol === "http:" && options.allowLocalHttp && isLocal) {
    return { ok: true, url: url.toString(), isLocal: true };
  }

  return {
    ok: false,
    error: "Используйте HTTPS. HTTP разрешен только для локальной разработки.",
  };
}
