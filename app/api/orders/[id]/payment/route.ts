import { noStoreHeaders, orderApiErrorResponse } from "@/lib/orderApiResponse";
import { getBearerToken } from "@/lib/serverOrderSecurity";
import { ensureOrderPayment, getAuthorizedPaymentOrder, paymentResponse, refreshOrderPayment } from "@/lib/serverPaymentService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const order = await getAuthorizedPaymentOrder(id, getBearerToken(request));
    const saved = await ensureOrderPayment(order);
    return Response.json(paymentResponse(await refreshOrderPayment(saved)), { headers: noStoreHeaders });
  } catch (error) { return orderApiErrorResponse(error); }
}

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const order = await getAuthorizedPaymentOrder(id, getBearerToken(request));
    return Response.json(paymentResponse(await refreshOrderPayment(order)), { headers: noStoreHeaders });
  } catch (error) { return orderApiErrorResponse(error); }
}
