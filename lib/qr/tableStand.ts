export const TABLE_STAND_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const TABLE_STAND_MIN_WIDTH = 1000;
export const TABLE_STAND_MIN_HEIGHT = 1500;
export const TABLE_STAND_ASPECT_RATIO = 2 / 3;
export const TABLE_STAND_ASPECT_TOLERANCE = 0.002;
export const TABLE_STAND_MIN_QR_SIZE = 0.3;
export const TABLE_STAND_MAX_QR_SIZE = 0.6;
export const TABLE_STAND_MIN_SAFE_PADDING = 0.04;
export const TABLE_STAND_MAX_SAFE_PADDING = 0.12;
export const TABLE_STAND_CUSTOM_TEMPLATE_ID = "custom";

export const tableStandMimeTypes = ["image/png", "image/jpeg"] as const;

export type TableStandMimeType = (typeof tableStandMimeTypes)[number];

export type TableStandTemplate = {
  id: string;
  kind: "custom" | "system";
  name: string;
  templateUrl: string;
  templateWidth: number;
  templateHeight: number;
  templateMimeType: TableStandMimeType;
  qrPositionX: number;
  qrPositionY: number;
  qrSize: number;
  whiteBackground: boolean;
  safePadding: number;
  updatedAt: string;
};

export type TableStandLibrary = {
  version: 1;
  activeTemplateId: string | null;
  templates: TableStandTemplate[];
};

export type TableStandLayoutInput = Pick<
  TableStandTemplate,
  | "qrPositionX"
  | "qrPositionY"
  | "qrSize"
  | "whiteBackground"
  | "safePadding"
>;

export const defaultTableStandLayout: TableStandLayoutInput = {
  qrPositionX: 0.5,
  qrPositionY: 0.5,
  qrSize: 0.35,
  whiteBackground: true,
  safePadding: 0.06,
};

export function createEmptyTableStandLibrary(): TableStandLibrary {
  return {
    version: 1,
    activeTemplateId: null,
    templates: [],
  };
}

export function validateTableStandDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    return { ok: false as const, error: "Не удалось определить размер изображения." };
  }

  if (width < TABLE_STAND_MIN_WIDTH || height < TABLE_STAND_MIN_HEIGHT) {
    return {
      ok: false as const,
      error: `Минимальный размер шаблона — ${TABLE_STAND_MIN_WIDTH} × ${TABLE_STAND_MIN_HEIGHT} px.`,
    };
  }

  if (Math.abs(width / height - TABLE_STAND_ASPECT_RATIO) > TABLE_STAND_ASPECT_TOLERANCE) {
    return {
      ok: false as const,
      error:
        "Соотношение сторон должно быть 2:3. Подготовьте другой файл — Tablo не обрезает шаблон автоматически.",
    };
  }

  return { ok: true as const };
}

export function validateTableStandLayout(value: unknown) {
  if (!isRecord(value)) {
    return { ok: false as const, error: "Некорректные настройки макета." };
  }

  const qrPositionX = finiteNumber(value.qrPositionX);
  const qrPositionY = finiteNumber(value.qrPositionY);
  const qrSize = finiteNumber(value.qrSize);
  const safePadding = finiteNumber(value.safePadding);

  if (
    qrPositionX === null ||
    qrPositionY === null ||
    qrSize === null ||
    safePadding === null ||
    typeof value.whiteBackground !== "boolean"
  ) {
    return { ok: false as const, error: "Некорректные настройки макета." };
  }

  if (qrSize < TABLE_STAND_MIN_QR_SIZE || qrSize > TABLE_STAND_MAX_QR_SIZE) {
    return { ok: false as const, error: "Размер QR-кода находится вне допустимого диапазона." };
  }

  const halfSize = qrSize / 2;
  if (
    qrPositionX < halfSize ||
    qrPositionX > 1 - halfSize ||
    qrPositionY < halfSize ||
    qrPositionY > 1 - halfSize
  ) {
    return { ok: false as const, error: "QR-код не должен выходить за границы макета." };
  }

  if (
    safePadding < TABLE_STAND_MIN_SAFE_PADDING ||
    safePadding > TABLE_STAND_MAX_SAFE_PADDING
  ) {
    return { ok: false as const, error: "Безопасный отступ находится вне допустимого диапазона." };
  }

  return {
    ok: true as const,
    layout: {
      qrPositionX,
      qrPositionY,
      qrSize,
      whiteBackground: value.whiteBackground,
      safePadding,
    } satisfies TableStandLayoutInput,
  };
}

export function clampTableStandPosition(
  position: number,
  qrSize: number,
) {
  const halfSize = qrSize / 2;
  return Math.min(1 - halfSize, Math.max(halfSize, position));
}

export function isTableStandMimeType(value: unknown): value is TableStandMimeType {
  return tableStandMimeTypes.includes(value as TableStandMimeType);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
