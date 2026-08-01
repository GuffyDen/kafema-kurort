import {
  isTableStandMimeType,
  type TableStandMimeType,
} from "@/lib/qr/tableStand";

export type RasterImageMetadata = {
  width: number;
  height: number;
  mimeType: TableStandMimeType;
};

export function readRasterImageMetadata(bytes: Uint8Array): RasterImageMetadata {
  const png = readPngMetadata(bytes);
  if (png) return png;

  const jpeg = readJpegMetadata(bytes);
  if (jpeg) return jpeg;

  throw new Error("Файл поврежден или не является PNG/JPG изображением.");
}

function readPngMetadata(bytes: Uint8Array): RasterImageMetadata | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    mimeType: "image/png",
  };
}

function readJpegMetadata(bytes: Uint8Array): RasterImageMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (isStartOfFrame(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return { width, height, mimeType: "image/jpeg" };
    }

    offset += segmentLength;
  }

  throw new Error("JPEG-файл поврежден или не содержит размеров изображения.");
}

function isStartOfFrame(marker: number) {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

export function assertRasterMimeType(
  metadata: RasterImageMetadata,
  declaredMimeType: string,
) {
  if (!isTableStandMimeType(declaredMimeType) || metadata.mimeType !== declaredMimeType) {
    throw new Error("Формат файла не соответствует его содержимому.");
  }
}
