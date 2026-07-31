import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import { getStorefront } from "@/lib/storefrontService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const storefront = await getStorefront();

    return Response.json(
      {
        externalMenu: storefront.externalMenu,
        syncedAt: storefront.syncedAt,
        menu: storefront.menu,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
