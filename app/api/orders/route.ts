import { noStoreHeaders, orderApiErrorResponse } from "@/lib/orderApiResponse";
import { createServerOrder, OrderServiceError } from "@/lib/serverOrderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const maximumRequestBytes = 64 * 1024;

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > maximumRequestBytes) {
      throw new OrderServiceError("Тело запроса слишком большое.", 413, "BODY_TOO_LARGE");
    }
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).length > maximumRequestBytes) {
      throw new OrderServiceError("Тело запроса слишком большое.", 413, "BODY_TOO_LARGE");
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new OrderServiceError("Некорректный JSON.", 400, "INVALID_JSON");
    }
    const result = await createServerOrder(
      body,
      request.headers.get("idempotency-key") ?? "",
    );
    return Response.json(result, {
      status: result.idempotent ? 200 : 201,
      headers: noStoreHeaders,
    });
  } catch (error) {
    return orderApiErrorResponse(error);
  }
}
