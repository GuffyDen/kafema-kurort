import {
  AdminAuthStorageError,
  authenticateAdminCredentials,
  clearAdminLoginAttempts,
  consumeAdminLoginAttempt,
  createAdminSession,
  isSameOriginAdminRequest,
  serializeAdminSessionCookie,
} from "@/lib/serverAdminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };
const invalidCredentials = {
  error: "Неверный логин или пароль.",
  code: "INVALID_CREDENTIALS",
};

export async function POST(request: Request) {
  if (!isSameOriginAdminRequest(request)) {
    return Response.json(
      { error: "Запрос отклонён.", code: "INVALID_ORIGIN" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  try {
    const rateLimit = await consumeAdminLoginAttempt(request);
    if (!rateLimit.allowed) {
      return Response.json(
        {
          error: "Слишком много попыток входа. Попробуйте позже.",
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            ...noStoreHeaders,
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 4_096) {
      return Response.json(invalidCredentials, {
        status: 400,
        headers: noStoreHeaders,
      });
    }

    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 4_096) {
        return Response.json(invalidCredentials, {
          status: 400,
          headers: noStoreHeaders,
        });
      }
      body = JSON.parse(text);
    } catch {
      return Response.json(invalidCredentials, {
        status: 400,
        headers: noStoreHeaders,
      });
    }

    const username =
      typeof body === "object" && body !== null && "username" in body
        ? body.username
        : undefined;
    const password =
      typeof body === "object" && body !== null && "password" in body
        ? body.password
        : undefined;
    if (typeof username !== "string" || typeof password !== "string") {
      return Response.json(invalidCredentials, {
        status: 400,
        headers: noStoreHeaders,
      });
    }

    const account = await authenticateAdminCredentials(username, password);
    if (!account) {
      return Response.json(invalidCredentials, {
        status: 401,
        headers: noStoreHeaders,
      });
    }

    const { token } = await createAdminSession(account);
    await clearAdminLoginAttempts(rateLimit.key);
    return Response.json(
      { authenticated: true },
      {
        headers: {
          ...noStoreHeaders,
          "Set-Cookie": serializeAdminSessionCookie(token),
        },
      },
    );
  } catch (error) {
    if (error instanceof AdminAuthStorageError) {
      return Response.json(
        {
          error: "Вход администратора временно недоступен.",
          code: "ADMIN_AUTH_UNAVAILABLE",
        },
        { status: 503, headers: noStoreHeaders },
      );
    }
    return Response.json(
      { error: "Не удалось выполнить вход.", code: "ADMIN_AUTH_FAILED" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
