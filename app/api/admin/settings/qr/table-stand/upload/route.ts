import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { TABLE_STAND_MAX_FILE_SIZE } from "@/lib/qr/tableStand";
import { getTableStandBlobPathPrefix } from "@/lib/tenantSettingsStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const uploadPathPrefix = getTableStandBlobPathPrefix();
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedPathname(pathname, uploadPathPrefix)) {
          throw new Error("Недопустимый путь загрузки шаблона.");
        }

        return {
          allowedContentTypes: ["image/png", "image/jpeg"],
          maximumSizeInBytes: TABLE_STAND_MAX_FILE_SIZE,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
        };
      },
      onUploadCompleted: async () => {
        // Metadata is verified and persisted by the finalize endpoint.
      },
    });

    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось подготовить загрузку шаблона.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function isAllowedPathname(pathname: string, prefix: string) {
  if (!pathname.startsWith(prefix)) return false;
  const suffix = pathname.slice(prefix.length);
  return /^[0-9a-f-]{36}\.(png|jpg)$/i.test(suffix);
}
