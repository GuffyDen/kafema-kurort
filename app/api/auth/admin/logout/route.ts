import {
  AdminAuthStorageError,
  destroyAdminSession,
  isSameOriginAdminRequest,
  serializeExpiredAdminSessionCookie,
} from "@/lib/serverAdminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (!isSameOriginAdminRequest(request)) {
    return Response.json(
      { error: "Запрос отклонён.", code: "INVALID_ORIGIN" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  try {
    await destroyAdminSession(request);
    return Response.json(
      { authenticated: false },
      {
        headers: {
          ...noStoreHeaders,
          "Set-Cookie": serializeExpiredAdminSessionCookie(),
        },
      },
    );
  } catch (error) {
    if (error instanceof AdminAuthStorageError) {
      return Response.json(
        {
          error: "Не удалось завершить сессию. Повторите попытку.",
          code: "ADMIN_AUTH_UNAVAILABLE",
        },
        { status: 503, headers: noStoreHeaders },
      );
    }
    return Response.json(
      { error: "Не удалось выйти.", code: "ADMIN_LOGOUT_FAILED" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
