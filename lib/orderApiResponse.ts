import { PaymentError } from "@/lib/yookassaClient";
import { OrderServiceError } from "@/lib/serverOrderService";

export function orderApiErrorResponse(error: unknown) {
  if (error instanceof OrderServiceError || error instanceof PaymentError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: noStoreHeaders },
    );
  }

  return Response.json(
    { error: "Сервис заказов временно недоступен.", code: "ORDER_SERVICE_ERROR" },
    { status: 503, headers: noStoreHeaders },
  );
}

export const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };
