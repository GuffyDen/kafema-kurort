import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import {
  patchCategoryOverride,
  StorefrontPersistenceError,
} from "@/lib/storefrontOverrideStore";
import { getStorefront } from "@/lib/storefrontService";
import { parseCategoryOverridePatch } from "@/lib/storefrontValidation";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  try {
    const { categoryId } = await context.params;
    const patch = parseCategoryOverridePatch(await request.json());
    await patchCategoryOverride(categoryId, patch);
    return Response.json(await getStorefront(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof StorefrontPersistenceError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    return storefrontErrorResponse(error);
  }
}
