import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import { getAdminStorefront } from "@/lib/storefrontAdminService";
import { rejectUnauthorizedAdminRequest } from "@/lib/serverAdminRoute";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejection = await rejectUnauthorizedAdminRequest(request);
  if (rejection) return rejection;

  try {
    return Response.json(await getAdminStorefront(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return storefrontErrorResponse(error);
  }
}
