import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import {
  patchProductOverride,
  StorefrontPersistenceError,
} from "@/lib/storefrontOverrideStore";
import { getAdminStorefront } from "@/lib/storefrontAdminService";
import { parseProductOverridePatch } from "@/lib/storefrontValidation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await context.params;
    const patch = parseProductOverridePatch(await request.json());
    await patchProductOverride(itemId, patch);
    return Response.json(await getAdminStorefront(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof StorefrontPersistenceError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    return storefrontErrorResponse(error);
  }
}
