import { storefrontErrorResponse } from "@/lib/storefrontApiResponse";
import {
  StorefrontPersistenceError,
  updateCategoryOrder,
} from "@/lib/storefrontOverrideStore";
import { getAdminStorefront } from "@/lib/storefrontAdminService";
import { parseCategoryOrder } from "@/lib/storefrontValidation";
import { rejectUnauthorizedAdminRequest } from "@/lib/serverAdminRoute";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejection = await rejectUnauthorizedAdminRequest(request, {
    requireSameOrigin: true,
  });
  if (rejection) return rejection;

  let order: ReturnType<typeof parseCategoryOrder>;

  try {
    order = parseCategoryOrder(await request.json());
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Некорректный порядок категорий",
      },
      { status: 400 },
    );
  }

  try {
    await updateCategoryOrder(order);
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
