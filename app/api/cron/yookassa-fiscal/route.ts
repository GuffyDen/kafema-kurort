import { processFiscalQueue } from "@/lib/serverFiscalService";
import { noStoreHeaders } from "@/lib/orderApiResponse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.YOOKASSA_CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: noStoreHeaders });
  }
  try {
    const result = await processFiscalQueue();
    if (result.needsReview) console.warn("Fiscal receipts require review:", result.needsReview);
    return Response.json(result, { headers: noStoreHeaders });
  } catch {
    return Response.json({ error: "Fiscal reconciliation unavailable" }, { status: 503, headers: noStoreHeaders });
  }
}
