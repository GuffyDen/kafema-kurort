import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import {
  patchCategoryOverride,
  StorefrontPersistenceError,
} from "@/lib/storefrontOverrideStore";
import { getAdminStorefront } from "@/lib/storefrontAdminService";
import { parseCategoryOverridePatch } from "@/lib/storefrontValidation";
import { rejectUnauthorizedAdminRequest } from "@/lib/serverAdminRoute";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ categoryId: string }> },
) {
  const rejection = await rejectUnauthorizedAdminRequest(request, {
    requireSameOrigin: true,
  });
  if (rejection) return rejection;

  try {
    const { categoryId } = await context.params;
    const patch = parseCategoryOverridePatch(await request.json());
    await patchCategoryOverride(categoryId, patch);
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
