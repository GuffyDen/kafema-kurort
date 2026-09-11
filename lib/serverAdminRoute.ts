import "server-only";

import {
  authorizeAdminRequest,
  isSameOriginAdminRequest,
} from "@/lib/serverAdminAuth";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function rejectUnauthorizedAdminRequest(
  request: Request,
  options: { requireSameOrigin?: boolean } = {},
) {
  const authorization = await authorizeAdminRequest(request);
  if (!authorization.ok) {
    return Response.json(
      { error: authorization.message, code: "ADMIN_UNAUTHORIZED" },
      { status: authorization.status, headers: noStoreHeaders },
    );
  }

  if (options.requireSameOrigin && !isSameOriginAdminRequest(request)) {
    return Response.json(
      { error: "Запрос отклонён.", code: "INVALID_ORIGIN" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  return null;
}
