import {
  BaristaAuthStorageError,
  destroyBaristaSession,
  isSameOriginBaristaRequest,
  serializeExpiredBaristaSessionCookie,
} from "@/lib/serverBaristaAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSameOriginBaristaRequest(request)) {
    return Response.json(
      { error: "Запрос отклонён.", code: "INVALID_ORIGIN" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  try {
    await destroyBaristaSession(request);
    return Response.json(
      { authenticated: false },
      {
        headers: {
          ...noStoreHeaders,
          "Set-Cookie": serializeExpiredBaristaSessionCookie(),
        },
      },
    );
  } catch (error) {
    if (error instanceof BaristaAuthStorageError) {
      return Response.json(
        {
          error: "Не удалось завершить сессию. Повторите попытку.",
          code: "BARISTA_AUTH_UNAVAILABLE",
        },
        { status: 503, headers: noStoreHeaders },
      );
    }
    return Response.json(
      { error: "Не удалось выйти.", code: "BARISTA_LOGOUT_FAILED" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
