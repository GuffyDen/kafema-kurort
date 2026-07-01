import { checkIikoConnectionReal } from "@/lib/iikoCloudClient";

export async function POST() {
  try {
    const result = await checkIikoConnectionReal();

    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? sanitizeIikoError(error.message)
            : "Не удалось подключиться к iiko",
      },
      { status: 200 },
    );
  }
}

function sanitizeIikoError(message: string) {
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ********");
}
