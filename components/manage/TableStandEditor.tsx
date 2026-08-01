"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  clampTableStandPosition,
  defaultTableStandLayout,
  TABLE_STAND_MAX_FILE_SIZE,
  TABLE_STAND_MAX_QR_SIZE,
  TABLE_STAND_MAX_SAFE_PADDING,
  TABLE_STAND_MIN_QR_SIZE,
  TABLE_STAND_MIN_SAFE_PADDING,
  type TableStandLayoutInput,
  type TableStandLibrary,
  type TableStandTemplate,
  validateTableStandDimensions,
} from "@/lib/qr/tableStand";

type TableStandEditorProps = {
  confirmedUrl: string;
  disabled: boolean;
  initialLibrary: TableStandLibrary;
  uploadPathPrefix: string;
  onLibraryChange: (library: TableStandLibrary) => void;
};

type TableStandApiResponse = {
  tableStand?: TableStandLibrary;
  error?: string;
  cleanupWarning?: string | null;
};

type EditorAction = "idle" | "uploading" | "saving" | "exporting";

export function TableStandEditor({
  confirmedUrl,
  disabled,
  initialLibrary,
  uploadPathPrefix,
  onLibraryChange,
}: TableStandEditorProps) {
  const library = initialLibrary;
  const initialTemplate =
    library.templates.find(
      (template) => template.id === library.activeTemplateId,
    ) ?? null;
  const [draftLayout, setDraftLayout] = useState<TableStandLayoutInput | null>(
    initialTemplate ? getLayout(initialTemplate) : null,
  );
  const [confirmedActiveTemplateId, setConfirmedActiveTemplateId] = useState(
    initialLibrary.activeTemplateId,
  );
  const [qrPreviewUrl, setQrPreviewUrl] = useState("");
  const [action, setAction] = useState<EditorAction>("idle");
  const [progress, setProgress] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);

  const activeTemplate = useMemo(
    () =>
      library.templates.find(
        (template) => template.id === library.activeTemplateId,
      ) ?? null,
    [library],
  );
  const savedLayout = activeTemplate ? getLayout(activeTemplate) : null;
  const hasUnsavedLayout =
    library.activeTemplateId !== confirmedActiveTemplateId ||
    (Boolean(draftLayout && savedLayout) &&
      JSON.stringify(draftLayout) !== JSON.stringify(savedLayout));
  const isBusy = action !== "idle";
  const editorDisabled = disabled || isBusy || !activeTemplate || !draftLayout;

  useEffect(() => {
    let cancelled = false;
    if (!confirmedUrl) return;

    void QRCode.toDataURL(confirmedUrl, {
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "H",
      margin: 4,
      type: "image/png",
      width: 1024,
    }).then((value) => {
      if (!cancelled) setQrPreviewUrl(value);
    });

    return () => {
      cancelled = true;
    };
  }, [confirmedUrl]);

  function updateLibrary(nextLibrary: TableStandLibrary) {
    const nextTemplate =
      nextLibrary.templates.find(
        (template) => template.id === nextLibrary.activeTemplateId,
      ) ?? null;
    setDraftLayout(nextTemplate ? getLayout(nextTemplate) : null);
    setConfirmedActiveTemplateId(nextLibrary.activeTemplateId);
    onLibraryChange(nextLibrary);
  }

  async function selectFile(file: File | undefined) {
    if (!file || isBusy || disabled) return;

    let stage: "validation" | "upload" | "finalize" = "validation";
    setError("");
    setMessage("");
    setProgress(0);

    try {
      const clientMetadata = await validateImageFile(file);
      setAction("uploading");
      stage = "upload";
      const extension = clientMetadata.mimeType === "image/png" ? "png" : "jpg";
      const pathname = `${uploadPathPrefix}${crypto.randomUUID()}.${extension}`;
      const blob = await upload(pathname, file, {
        access: "public",
        contentType: clientMetadata.mimeType,
        handleUploadUrl: "/api/admin/settings/qr/table-stand/upload",
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      stage = "finalize";
      const response = await fetch("/api/admin/settings/qr/table-stand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateUrl: blob.url }),
      });
      const payload = (await response.json()) as TableStandApiResponse;

      if (!response.ok || !payload.tableStand) {
        throw new Error(payload.error || "Не удалось сохранить шаблон.");
      }

      updateLibrary(payload.tableStand);
      setMessage(
        payload.cleanupWarning ||
          "Шаблон загружен. Настройте QR-код и сохраните макет.",
      );
    } catch (uploadError) {
      setError(
        stage === "upload"
          ? "Не удалось загрузить шаблон в хранилище. Попробуйте еще раз."
          : uploadError instanceof Error
          ? uploadError.message
          : "Не удалось загрузить шаблон.",
      );
    } finally {
      setAction("idle");
      setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveLayout() {
    if (!activeTemplate || !draftLayout || isBusy || !hasUnsavedLayout) return;

    setAction("saving");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/settings/qr/table-stand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: activeTemplate.id,
          layout: draftLayout,
        }),
      });
      const payload = (await response.json()) as TableStandApiResponse;
      if (!response.ok || !payload.tableStand) {
        throw new Error(payload.error || "Не удалось сохранить настройки макета.");
      }

      updateLibrary(payload.tableStand);
      setMessage("Макет сохранен.");
    } catch (saveError) {
      const confirmedTemplate = library.templates.find(
        (template) => template.id === confirmedActiveTemplateId,
      );
      onLibraryChange({
        ...library,
        activeTemplateId: confirmedActiveTemplateId,
      });
      setDraftLayout(confirmedTemplate ? getLayout(confirmedTemplate) : savedLayout);
      setError(
        saveError instanceof Error
          ? `${saveError.message} Подтвержденные настройки восстановлены.`
          : "Не удалось сохранить макет. Подтвержденные настройки восстановлены.",
      );
    } finally {
      setAction("idle");
    }
  }

  async function downloadTableStand() {
    if (
      !activeTemplate ||
      !draftLayout ||
      disabled ||
      isBusy ||
      hasUnsavedLayout ||
      !confirmedUrl
    ) {
      return;
    }

    setAction("exporting");
    setError("");
    setMessage("");

    try {
      const templateImage = await loadImage(withCacheBuster(activeTemplate));
      const canvas = document.createElement("canvas");
      canvas.width = activeTemplate.templateWidth;
      canvas.height = activeTemplate.templateHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas недоступен в этом браузере.");

      context.drawImage(templateImage, 0, 0, canvas.width, canvas.height);

      const tileSize = Math.round(canvas.width * draftLayout.qrSize);
      const safePadding = Math.round(tileSize * draftLayout.safePadding);
      const qrPixelSize = Math.max(1, tileSize - safePadding * 2);
      const qrDataUrl = await QRCode.toDataURL(confirmedUrl, {
        color: { dark: "#000000", light: "#FFFFFF" },
        errorCorrectionLevel: "H",
        margin: 4,
        type: "image/png",
        width: qrPixelSize,
      });
      const qrImage = await loadImage(qrDataUrl);
      const left = Math.round(canvas.width * draftLayout.qrPositionX - tileSize / 2);
      const top = Math.round(canvas.height * draftLayout.qrPositionY - tileSize / 2);

      if (draftLayout.whiteBackground) {
        context.fillStyle = "#FFFFFF";
        context.fillRect(left, top, tileSize, tileSize);
      }
      context.drawImage(
        qrImage,
        left + safePadding,
        top + safePadding,
        qrPixelSize,
        qrPixelSize,
      );

      const result = await canvasToBlob(canvas);
      downloadBlob(result, "kafema-table-stand.png");
      setMessage("Table Stand скачан в исходном разрешении шаблона.");
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Не удалось подготовить Table Stand.",
      );
    } finally {
      setAction("idle");
    }
  }

  function updateLayout(patch: Partial<TableStandLayoutInput>) {
    setDraftLayout((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      next.qrPositionX = clampTableStandPosition(next.qrPositionX, next.qrSize);
      next.qrPositionY = clampTableStandPosition(next.qrPositionY, next.qrSize);
      return next;
    });
    setError("");
    setMessage("");
  }

  function moveQrFromPointer(clientX: number, clientY: number) {
    const preview = previewRef.current;
    if (!preview || !draftLayout) return;
    const bounds = preview.getBoundingClientRect();
    updateLayout({
      qrPositionX: clampTableStandPosition(
        (clientX - bounds.left) / bounds.width,
        draftLayout.qrSize,
      ),
      qrPositionY: clampTableStandPosition(
        (clientY - bounds.top) / bounds.height,
        draftLayout.qrSize,
      ),
    });
  }

  const previewStyle = activeTemplate
    ? { backgroundImage: `url("${withCacheBuster(activeTemplate)}")` }
    : undefined;

  return (
    <section className="mt-10 border-t border-[#E6E6E6] pt-8">
      <div>
        <p className="text-xs font-black uppercase text-[#E30613]">Table Stand</p>
        <h3 className="mt-2 text-xl font-black text-[#1A1A1A]">
          Настройка печатного макета
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#777777]">
          Загрузите готовый фон без QR-кода. Tablo добавит поверх него актуальную
          ссылку клиентской витрины.
        </p>
      </div>

      <div className="mt-5 rounded-2xl bg-[#F7F7F7] p-4 text-sm leading-6 text-[#555555]">
        <p className="font-black text-[#1A1A1A]">Формат шаблона</p>
        <p className="mt-1">
          PNG или JPG, вертикальный формат 2:3, минимум 1000 × 1500 px,
          рекомендуется 2000 × 3000 px, до 10 МБ, профиль sRGB. Загружайте фон
          без QR-кода и оставьте для него свободное место.
        </p>
      </div>

      <div className="mt-4 min-h-6 text-sm font-bold" aria-live="polite">
        {hasUnsavedLayout ? (
          <p className="text-[#9A6700]">Есть несохраненные изменения макета.</p>
        ) : null}
        {error ? <p className="text-[#B42318]">{error}</p> : null}
        {!error && message ? <p className="text-[#177245]">{message}</p> : null}
      </div>

      {library.templates.length > 0 ? (
        <div className="mt-5">
          <p className="text-sm font-black text-[#1A1A1A]">Шаблоны</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {library.templates.map((template) => (
              <button
                key={template.id}
                type="button"
                aria-pressed={template.id === library.activeTemplateId}
                className={`min-h-11 rounded-2xl border px-4 text-sm font-black transition ${
                  template.id === library.activeTemplateId
                    ? "border-[#E30613] bg-[#FFF1F2] text-[#E30613]"
                    : "border-[#E6E6E6] bg-white text-[#555555] hover:bg-[#F7F7F7]"
                }`}
                disabled={isBusy}
                onClick={() => {
                  const next = { ...library, activeTemplateId: template.id };
                  setDraftLayout(getLayout(template));
                  onLibraryChange(next);
                  setMessage("");
                  setError("");
                }}
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={`mt-5 rounded-3xl border-2 border-dashed p-5 text-center transition ${
          isDraggingFile
            ? "border-[#E30613] bg-[#FFF5F5]"
            : "border-[#D7D7D7] bg-white"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled && !isBusy) setIsDraggingFile(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) setIsDraggingFile(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setIsDraggingFile(false);
          void selectFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="image/png,image/jpeg"
          disabled={disabled || isBusy}
          onChange={(event) => void selectFile(event.target.files?.[0])}
        />
        <button
          type="button"
          className="min-h-12 rounded-2xl bg-[#1A1A1A] px-5 font-black text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#D7D7D7]"
          disabled={disabled || isBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {action === "uploading"
            ? `Загрузка ${progress}%`
            : activeTemplate
              ? "Заменить шаблон"
              : "Загрузить шаблон"}
        </button>
        <p className="mt-2 text-xs font-semibold text-[#777777]">
          Перетащите файл сюда или выберите его на устройстве.
        </p>
      </div>

      {activeTemplate && draftLayout ? (
        <>
          <div
            ref={previewRef}
            className="relative mx-auto mt-6 aspect-[2/3] w-full max-w-[440px] overflow-hidden rounded-3xl border border-[#E6E6E6] bg-[#EFEFEF] bg-cover bg-center shadow-[0_18px_44px_rgba(26,26,26,0.08)]"
            style={previewStyle}
          >
            {qrPreviewUrl ? (
              <div
                className={`absolute grid cursor-grab touch-none place-items-center overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.16)] transition-shadow active:cursor-grabbing active:shadow-[0_12px_30px_rgba(0,0,0,0.24)] ${
                  draftLayout.whiteBackground ? "bg-white" : "bg-transparent"
                }`}
                style={{
                  left: `${draftLayout.qrPositionX * 100}%`,
                  top: `${draftLayout.qrPositionY * 100}%`,
                  width: `${draftLayout.qrSize * 100}%`,
                  aspectRatio: "1 / 1",
                  padding: `${draftLayout.safePadding * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
                onPointerDown={(event) => {
                  if (editorDisabled) return;
                  pointerIdRef.current = event.pointerId;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  moveQrFromPointer(event.clientX, event.clientY);
                }}
                onPointerMove={(event) => {
                  if (pointerIdRef.current !== event.pointerId) return;
                  moveQrFromPointer(event.clientX, event.clientY);
                }}
                onPointerUp={(event) => {
                  if (pointerIdRef.current === event.pointerId) {
                    pointerIdRef.current = null;
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                }}
                onPointerCancel={() => {
                  pointerIdRef.current = null;
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="QR-код на макете Table Stand"
                  className="block h-full w-full select-none object-contain"
                  draggable={false}
                  src={qrPreviewUrl}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-5 rounded-3xl border border-[#E6E6E6] p-5 sm:grid-cols-2">
            <RangeControl
              label="Размер QR"
              min={TABLE_STAND_MIN_QR_SIZE}
              max={TABLE_STAND_MAX_QR_SIZE}
              step={0.01}
              value={draftLayout.qrSize}
              valueLabel={`${Math.round(draftLayout.qrSize * 100)}%`}
              disabled={editorDisabled}
              onChange={(qrSize) => updateLayout({ qrSize })}
            />
            <RangeControl
              label="Безопасный отступ"
              min={TABLE_STAND_MIN_SAFE_PADDING}
              max={TABLE_STAND_MAX_SAFE_PADDING}
              step={0.01}
              value={draftLayout.safePadding}
              valueLabel={`${Math.round(draftLayout.safePadding * 100)}%`}
              disabled={editorDisabled}
              onChange={(safePadding) => updateLayout({ safePadding })}
            />
            <RangeControl
              label="Положение X"
              min={draftLayout.qrSize / 2}
              max={1 - draftLayout.qrSize / 2}
              step={0.005}
              value={draftLayout.qrPositionX}
              valueLabel={`${Math.round(draftLayout.qrPositionX * 100)}%`}
              disabled={editorDisabled}
              onChange={(qrPositionX) => updateLayout({ qrPositionX })}
            />
            <RangeControl
              label="Положение Y"
              min={draftLayout.qrSize / 2}
              max={1 - draftLayout.qrSize / 2}
              step={0.005}
              value={draftLayout.qrPositionY}
              valueLabel={`${Math.round(draftLayout.qrPositionY * 100)}%`}
              disabled={editorDisabled}
              onChange={(qrPositionY) => updateLayout({ qrPositionY })}
            />

            <div className="sm:col-span-2">
              <p className="text-sm font-black text-[#1A1A1A]">Белая подложка</p>
              <button
                type="button"
                aria-pressed={draftLayout.whiteBackground}
                className={`mt-2 min-h-11 rounded-2xl border px-4 text-sm font-black transition ${
                  draftLayout.whiteBackground
                    ? "border-[#177245] bg-[#ECFDF3] text-[#177245]"
                    : "border-[#E6E6E6] bg-white text-[#555555]"
                }`}
                disabled={editorDisabled}
                onClick={() =>
                  updateLayout({ whiteBackground: !draftLayout.whiteBackground })
                }
              >
                {draftLayout.whiteBackground ? "Включена" : "Выключена"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button
                type="button"
                className="min-h-11 rounded-2xl border border-[#E6E6E6] px-4 text-sm font-black text-[#1A1A1A] transition hover:bg-[#F7F7F7] disabled:text-[#A1A1AA]"
                disabled={editorDisabled}
                onClick={() => updateLayout({ qrPositionX: 0.5, qrPositionY: 0.5 })}
              >
                По центру
              </button>
              <button
                type="button"
                className="min-h-11 rounded-2xl border border-[#E6E6E6] px-4 text-sm font-black text-[#1A1A1A] transition hover:bg-[#F7F7F7] disabled:text-[#A1A1AA]"
                disabled={editorDisabled}
                onClick={() => updateLayout(defaultTableStandLayout)}
              >
                Сбросить настройки
              </button>
              <button
                type="button"
                aria-label="Перемещать QR-код клавишами со стрелками"
                className="min-h-11 rounded-2xl border border-[#E6E6E6] px-4 text-sm font-black text-[#555555] outline-none transition focus:border-[#E30613] disabled:text-[#A1A1AA]"
                disabled={editorDisabled}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 0.05 : 0.01;
                  const offsets: Record<string, [number, number]> = {
                    ArrowLeft: [-step, 0],
                    ArrowRight: [step, 0],
                    ArrowUp: [0, -step],
                    ArrowDown: [0, step],
                  };
                  const offset = offsets[event.key];
                  if (!offset) return;
                  event.preventDefault();
                  updateLayout({
                    qrPositionX: draftLayout.qrPositionX + offset[0],
                    qrPositionY: draftLayout.qrPositionY + offset[1],
                  });
                }}
              >
                Переместить клавишами
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="min-h-12 rounded-2xl bg-[#E30613] px-5 font-black text-white transition hover:bg-[#C80010] disabled:cursor-not-allowed disabled:bg-[#EFEFEF] disabled:text-[#777777]"
              disabled={editorDisabled || !hasUnsavedLayout}
              onClick={() => void saveLayout()}
            >
              {action === "saving" ? "Сохранение..." : "Сохранить макет"}
            </button>
            <button
              type="button"
              className="min-h-12 rounded-2xl border border-[#E6E6E6] bg-white px-5 font-black text-[#1A1A1A] transition hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:text-[#A1A1AA]"
              disabled={
                disabled || isBusy || hasUnsavedLayout || !confirmedUrl
              }
              onClick={() => void downloadTableStand()}
            >
              {action === "exporting" ? "Подготовка..." : "Скачать Table Stand"}
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#777777]">
            Минимальный размер QR ограничен 30% ширины макета, чтобы сохранить
            читаемость примерно от 30 × 30 мм на стандартной печати.
          </p>
        </>
      ) : (
        <div className="mt-6 rounded-3xl bg-[#F7F7F7] px-5 py-10 text-center">
          <p className="font-black text-[#1A1A1A]">Шаблон еще не загружен</p>
          <p className="mt-2 text-sm leading-6 text-[#777777]">
            После загрузки здесь появятся предпросмотр и настройки QR-кода.
          </p>
        </div>
      )}
    </section>
  );
}

function RangeControl({
  label,
  min,
  max,
  step,
  value,
  valueLabel,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3 text-sm font-black text-[#1A1A1A]">
        {label}
        <span className="text-[#777777]">{valueLabel}</span>
      </span>
      <input
        className="mt-3 w-full accent-[#E30613]"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function getLayout(template: TableStandTemplate): TableStandLayoutInput {
  return {
    qrPositionX: template.qrPositionX,
    qrPositionY: template.qrPositionY,
    qrSize: template.qrSize,
    whiteBackground: template.whiteBackground,
    safePadding: template.safePadding,
  };
}

async function validateImageFile(file: File) {
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    throw new Error("Выберите PNG или JPG. SVG и PDF пока не поддерживаются.");
  }
  if (file.size > TABLE_STAND_MAX_FILE_SIZE) {
    throw new Error("Размер файла не должен превышать 10 МБ.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const dimensions = validateTableStandDimensions(
      image.naturalWidth,
      image.naturalHeight,
    );
    if (!dimensions.ok) throw new Error(dimensions.error);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      mimeType: file.type as "image/png" | "image/jpeg",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = document.createElement("img");
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не удалось прочитать изображение."));
    image.src = src;
  });
}

function withCacheBuster(template: TableStandTemplate) {
  const url = new URL(template.templateUrl);
  url.searchParams.set("v", template.updatedAt);
  return url.toString();
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Не удалось экспортировать PNG."));
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
