import { noStoreHeaders, orderApiErrorResponse } from "@/lib/orderApiResponse";
import { processPaymentNotification } from "@/lib/serverPaymentService";
import { PaymentError } from "@/lib/yookassaClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 65536) throw new PaymentError("BODY_TOO_LARGE", 413);
    const text = await request.text();
    if (Buffer.byteLength(text) > 65536) throw new PaymentError("BODY_TOO_LARGE", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new PaymentError("INVALID_JSON", 400); }
    await processPaymentNotification(body);
    return Response.json({ received: true }, { headers: noStoreHeaders });
  } catch (error) { return orderApiErrorResponse(error); }
}
