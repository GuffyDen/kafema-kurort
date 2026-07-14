import "server-only";

import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  extractIikoWebhookEvents,
  type IikoWebhookRequestLog,
} from "@/lib/iikoWebhookStore";

const localAcceptanceDirectory = "/private/tmp/tableorder-test";
const vercelAcceptanceDirectory = "/tmp/tableorder-test";

export type IikoWebhookAcceptancePersistence = {
  directory: string;
  eventFile: string;
  summaryFile: string | null;
};

export async function saveIikoWebhookAcceptanceLog(
  requestLog: IikoWebhookRequestLog,
): Promise<IikoWebhookAcceptancePersistence> {
  const directory = getAcceptanceDirectory();
  await mkdir(directory, { recursive: true });

  const events = extractIikoWebhookEvents(requestLog.parsedJson);
  const fileName = createEventFileName(requestLog.receivedAt, requestLog.id);
  const eventFile = path.join(directory, fileName);
  const record = {
    receivedAt: requestLog.receivedAt,
    method: requestLog.method,
    path: requestLog.path,
    headers: requestLog.headers,
    rawBody: requestLog.rawBody,
    parsedJson: requestLog.parsedJson,
    httpStatus: requestLog.httpStatus,
    httpStatusText: requestLog.httpStatusText,
    success: requestLog.success,
    error: requestLog.error,
    eventType: requestLog.eventType,
    orderId: requestLog.orderId,
    posId: requestLog.posId,
    status: requestLog.orderStatus,
    terminalGroupId: requestLog.terminalGroupId,
    organizationId: requestLog.organizationId,
    correlationId: requestLog.correlationId,
    events,
  };

  await writePrivateJson(eventFile, record);

  let summaryFile: string | null = null;
  if (requestLog.success) {
    summaryFile = path.join(directory, "summary.json");
    const files = await readdir(directory);
    const savedWebhookFiles = files.filter(
      (file) => file.endsWith(".json") && file !== "summary.json",
    );
    const latestEvent = events.find((event) => event.orderId) ?? events[0] ?? null;
    const summary = {
      updatedAt: requestLog.receivedAt,
      source: "IIKO",
      totalSavedWebhookRequests: savedWebhookFiles.length,
      latestEventFile: fileName,
      eventType: latestEvent?.eventType ?? requestLog.eventType,
      orderId: latestEvent?.orderId ?? requestLog.orderId,
      posId: latestEvent?.posId ?? requestLog.posId,
      status: latestEvent?.orderStatus ?? requestLog.orderStatus,
      itemsCount: latestEvent?.itemsCount ?? 0,
      itemNames: latestEvent?.items.map((item) => item.name).filter(Boolean) ?? [],
      items: latestEvent?.items ?? [],
      terminalGroupId:
        latestEvent?.terminalGroupId ?? requestLog.terminalGroupId,
      organizationId: latestEvent?.organizationId ?? requestLog.organizationId,
      correlationId: latestEvent?.correlationId ?? requestLog.correlationId,
      events,
    };

    await writePrivateJsonAtomic(summaryFile, summary);
  }

  console.info("iiko webhook acceptance file saved", {
    eventFile,
    requestId: requestLog.id,
    summaryFile,
  });

  return { directory, eventFile, summaryFile };
}

function getAcceptanceDirectory() {
  return process.env.VERCEL ? vercelAcceptanceDirectory : localAcceptanceDirectory;
}

function createEventFileName(receivedAt: string, requestId: string) {
  const timestamp = receivedAt.replaceAll(":", "-").replaceAll(".", "-");
  const suffix = requestId.split("-").slice(-2).join("-");
  return `${timestamp}-${suffix}.json`;
}

async function writePrivateJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function writePrivateJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writePrivateJson(temporaryPath, value);
  await rename(temporaryPath, filePath);
}
