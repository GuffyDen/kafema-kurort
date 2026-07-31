import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import { getAdminStorefront } from "@/lib/storefrontAdminService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getAdminStorefront(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
