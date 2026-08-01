import { del, head } from "@vercel/blob";
import {
  assertRasterMimeType,
  readRasterImageMetadata,
} from "@/lib/qr/rasterImage";
import {
  isTableStandMimeType,
  TABLE_STAND_MAX_FILE_SIZE,
  validateTableStandDimensions,
  validateTableStandLayout,
} from "@/lib/qr/tableStand";
import {
  getTableStandBlobPathPrefix,
  saveCustomTableStandTemplate,
  saveTableStandLayout,
  StorefrontPersistenceError,
} from "@/lib/tenantSettingsStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let uploadedUrl: string | null = null;

  try {
    const body: unknown = await request.json();
    uploadedUrl = getStringField(body, "templateUrl");
    if (!uploadedUrl) {
      return Response.json(
        { error: "Не передан URL загруженного шаблона." },
        { status: 400 },
      );
    }

    const blob = await head(uploadedUrl);
    const pathPrefix = getTableStandBlobPathPrefix();
    if (!isAllowedBlobPath(blob.pathname, pathPrefix)) {
      return Response.json(
        { error: "Загруженный файл не принадлежит текущему заведению." },
        { status: 400 },
      );
    }

    if (!isTableStandMimeType(blob.contentType)) {
      return Response.json(
        { error: "Поддерживаются только PNG и JPG." },
        { status: 400 },
      );
    }

    if (blob.size > TABLE_STAND_MAX_FILE_SIZE) {
      return Response.json(
        { error: "Размер файла не должен превышать 10 МБ." },
        { status: 400 },
      );
    }

    const imageResponse = await fetch(withCacheBuster(blob.url), {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!imageResponse.ok) {
      throw new Error("Не удалось проверить загруженный шаблон.");
    }

    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (bytes.byteLength > TABLE_STAND_MAX_FILE_SIZE) {
      throw new Error("Размер файла не должен превышать 10 МБ.");
    }

    const metadata = readRasterImageMetadata(bytes);
    assertRasterMimeType(metadata, blob.contentType);
    const dimensions = validateTableStandDimensions(
      metadata.width,
      metadata.height,
    );
    if (!dimensions.ok) {
      await deleteUploadedBlob(blob.url);
      return Response.json({ error: dimensions.error }, { status: 400 });
    }

    const saved = await saveCustomTableStandTemplate({
      templateUrl: blob.url,
      templateWidth: metadata.width,
      templateHeight: metadata.height,
      templateMimeType: metadata.mimeType,
    });

    let cleanupWarning: string | null = null;
    if (
      saved.previousTemplate?.templateUrl &&
      saved.previousTemplate.templateUrl !== blob.url
    ) {
      try {
        await del(saved.previousTemplate.templateUrl);
      } catch {
        cleanupWarning =
          "Новый шаблон сохранен, но предыдущий файл не удалось удалить автоматически.";
      }
    }

    return Response.json(
      {
        tableStand: saved.document.tableStand,
        persistence: saved.persistence,
        cleanupWarning,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (uploadedUrl) await deleteUploadedBlob(uploadedUrl);
    return tableStandErrorResponse(error, "Не удалось сохранить шаблон.");
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    const templateId = getStringField(body, "templateId");
    const layoutValue = isRecord(body) ? body.layout : null;
    const validation = validateTableStandLayout(layoutValue);

    if (!templateId || !validation.ok) {
      return Response.json(
        {
          error: validation.ok
            ? "Не выбран шаблон Table Stand."
            : validation.error,
        },
        { status: 400 },
      );
    }

    const saved = await saveTableStandLayout(templateId, validation.layout);
    return Response.json(
      {
        tableStand: saved.document.tableStand,
        persistence: saved.persistence,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return tableStandErrorResponse(error, "Не удалось сохранить настройки макета.");
  }
}

function withCacheBuster(value: string) {
  const url = new URL(value);
  url.searchParams.set("verify", String(Date.now()));
  return url.toString();
}

async function deleteUploadedBlob(url: string) {
  try {
    await del(url);
  } catch {
    // A failed cleanup must not hide the original validation/storage error.
  }
}

function tableStandErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return Response.json(
    { error: message },
    {
      status: error instanceof StorefrontPersistenceError ? 503 : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function getStringField(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "string"
    ? value[key].trim()
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedBlobPath(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.(png|jpg)$/i.test(pathname.slice(prefix.length));
}
