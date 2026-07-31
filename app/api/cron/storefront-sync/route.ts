import { getStorefront, syncStorefrontMenu } from "@/lib/storefrontService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await syncStorefrontMenu();
    const storefront = await getStorefront();

    return Response.json(
      {
        revision: snapshot.revision,
        categories: storefront.categoriesCount,
        products: storefront.productsCount,
        syncedAt: snapshot.syncedAt,
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    console.error(
      "Scheduled storefront sync failed:",
      error instanceof Error ? error.message : "unknown error",
    );

    return Response.json(
      { error: "Не удалось обновить витрину" },
      { status: 502 },
    );
  }
}
