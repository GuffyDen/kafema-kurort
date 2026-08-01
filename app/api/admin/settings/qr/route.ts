import { validateQrTargetUrl } from "@/lib/qr/qrTargetUrl";
import {
  getTableStandBlobPathPrefix,
  readTenantSettings,
  saveQrTargetUrl,
  StorefrontPersistenceError,
} from "@/lib/tenantSettingsStore";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { document, persistence } = await readTenantSettings();
    const savedUrl = getValidUrl(document.qrTargetUrl);
    const configuredUrl = getValidUrl(process.env.NEXT_PUBLIC_APP_URL);
    const localUrl =
      process.env.NODE_ENV !== "production"
        ? getValidUrl(new URL("/", request.url).toString())
        : null;
    const qrTargetUrl = savedUrl ?? configuredUrl ?? localUrl;

    return Response.json(
      {
        qrTargetUrl: qrTargetUrl?.url ?? null,
        isSaved: Boolean(savedUrl),
        isLocalAddress: qrTargetUrl?.isLocal ?? false,
        source: savedUrl
          ? "saved"
          : configuredUrl
            ? "configuration"
            : localUrl
              ? "local-development"
              : "missing",
        updatedAt: savedUrl ? document.updatedAt : null,
        tableStand: document.tableStand,
        tableStandUploadPathPrefix: getTableStandBlobPathPrefix(),
        persistence,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    const qrTargetUrl =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as Record<string, unknown>).qrTargetUrl
        : undefined;
    const validation = validateQrTargetUrl(qrTargetUrl, {
      allowLocalHttp: process.env.NODE_ENV !== "production",
    });

    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    const { document, persistence } = await saveQrTargetUrl(validation.url);

    return Response.json(
      {
        qrTargetUrl: document.qrTargetUrl,
        isSaved: true,
        isLocalAddress: validation.isLocal,
        source: "saved",
        updatedAt: document.updatedAt,
        tableStand: document.tableStand,
        tableStandUploadPathPrefix: getTableStandBlobPathPrefix(),
        persistence,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Некорректный JSON." }, { status: 400 });
    }

    return settingsErrorResponse(error);
  }
}

function getValidUrl(value: unknown) {
  const validation = validateQrTargetUrl(value, {
    allowLocalHttp: process.env.NODE_ENV !== "production",
  });

  return validation.ok ? validation : null;
}

function settingsErrorResponse(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Не удалось загрузить настройки QR.";

  return Response.json(
    { error: message },
    { status: error instanceof StorefrontPersistenceError ? 503 : 500 },
  );
}
