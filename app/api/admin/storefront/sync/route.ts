import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import {
  clearStorefrontSourceCache,
  getStorefront,
} from "@/lib/storefrontService";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    clearStorefrontSourceCache();
    return Response.json(await getStorefront({ refresh: true }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
