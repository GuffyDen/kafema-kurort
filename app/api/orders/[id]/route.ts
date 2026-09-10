import { noStoreHeaders, orderApiErrorResponse } from "@/lib/orderApiResponse";
import { getBearerToken } from "@/lib/serverOrderSecurity";
import { getCustomerOrder, OrderServiceError } from "@/lib/serverOrderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) {
      throw new OrderServiceError("Заказ не найден.", 404, "ORDER_NOT_FOUND");
    }
    const { id } = await context.params;
    return Response.json(
      { order: await getCustomerOrder(id, accessToken) },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return orderApiErrorResponse(error);
  }
}
