import {
  getStorefrontAvailability,
  StorefrontAvailabilityError,
} from "@/lib/storefrontAvailabilityService";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    return Response.json(await getStorefrontAvailability(), {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const status =
      error instanceof StorefrontAvailabilityError && error.status
        ? 502
        : 503;

    return Response.json(
      {
        error: "Не удалось проверить наличие товаров",
      },
      {
        status,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
