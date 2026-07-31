import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import {
  deleteProductOverride,
  StorefrontPersistenceError,
} from "@/lib/storefrontOverrideStore";
import { getAdminStorefront } from "@/lib/storefrontAdminService";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  try {
    const { itemId } = await context.params;
    await deleteProductOverride(itemId);
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
