import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import { getStorefront } from "@/lib/storefrontService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getStorefront(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
