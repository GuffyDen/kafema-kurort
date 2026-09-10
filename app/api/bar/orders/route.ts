import { noStoreHeaders, orderApiErrorResponse } from "@/lib/orderApiResponse";
import { authorizeBaristaRequest } from "@/lib/serverOrderSecurity";
import { listBaristaOrders } from "@/lib/serverOrderService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authorization = authorizeBaristaRequest(request);
  if (!authorization.ok) {
    return Response.json(
      { error: authorization.message, code: "BARISTA_UNAUTHORIZED" },
      { status: authorization.status, headers: noStoreHeaders },
    );
  }

  try {
    return Response.json(
      { orders: await listBaristaOrders() },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return orderApiErrorResponse(error);
  }
}
