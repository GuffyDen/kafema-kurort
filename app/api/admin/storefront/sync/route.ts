import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import { getAdminStorefront } from "@/lib/storefrontAdminService";
import { syncStorefrontMenu } from "@/lib/storefrontService";
import { rejectUnauthorizedAdminRequest } from "@/lib/serverAdminRoute";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejection = await rejectUnauthorizedAdminRequest(request, {
    requireSameOrigin: true,
  });
  if (rejection) return rejection;

  try {
    await syncStorefrontMenu();
    return Response.json(await getAdminStorefront(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
