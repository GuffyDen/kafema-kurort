import { StorefrontIntegrationError } from "@/lib/storefrontService";

export function storefrontErrorResponse(error: unknown) {
  if (error instanceof StorefrontIntegrationError) {
    return Response.json(
      {
        error: error.message,
        httpStatus: error.status,
        correlationId: error.correlationId,
      },
      { status: error.status && error.status >= 400 ? 502 : 500 },
    );
  }

  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "Не удалось получить витрину",
    },
    { status: 500 },
  );
}

