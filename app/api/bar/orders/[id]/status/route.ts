import { noStoreHeaders, orderApiErrorResponse } from "@/lib/orderApiResponse";
import {
  authorizeBaristaRequest,
  isSameOriginBaristaRequest,
} from "@/lib/serverBaristaAuth";
import { updateServerOrderStatus, OrderServiceError } from "@/lib/serverOrderService";
import { after } from "next/server";
import { processFiscalOrder } from "@/lib/serverFiscalService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeBaristaRequest(request);
  if (!authorization.ok) {
    return Response.json(
      { error: authorization.message, code: "BARISTA_UNAUTHORIZED" },
      { status: authorization.status, headers: noStoreHeaders },
    );
  }

  if (!isSameOriginBaristaRequest(request)) {
    return Response.json(
      { error: "Запрос отклонён.", code: "INVALID_ORIGIN" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OrderServiceError("Некорректный JSON.", 400, "INVALID_JSON");
    }
    const { id } = await context.params;
    const status =
      typeof body === "object" && body !== null && "status" in body
        ? body.status
        : undefined;
    const order = await updateServerOrderStatus(id, status);
    if (order.status === "completed") after(async () => { await processFiscalOrder(order.id); });
    return Response.json(
      { order },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return orderApiErrorResponse(error);
  }
}
