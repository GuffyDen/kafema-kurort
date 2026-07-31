import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import { getAdminStorefront } from "@/lib/storefrontAdminService";
import { syncStorefrontMenu } from "@/lib/storefrontService";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await syncStorefrontMenu();
    return Response.json(await getAdminStorefront(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
