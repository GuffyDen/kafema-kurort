"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { TableStandEditor } from "@/components/manage/TableStandEditor";
import { validateQrTargetUrl } from "@/lib/qr/qrTargetUrl";
import {
  createEmptyTableStandLibrary,
  type TableStandLibrary,
} from "@/lib/qr/tableStand";

const previewQrOptions = {
  color: { dark: "#000000", light: "#FFFFFF" },
  errorCorrectionLevel: "H" as const,
  margin: 4,
  type: "image/png" as const,
  width: 720,
};

type QrSettingsResponse = {
  qrTargetUrl: string | null;
  isSaved: boolean;
  isLocalAddress: boolean;
  source: "saved" | "configuration" | "local-development" | "missing";
  updatedAt: string | null;
  tableStand: TableStandLibrary;
  tableStandUploadPathPrefix: string;
  error?: string;
};

type ActionState = "idle" | "loading" | "saving" | "qr";

function downloadDataUrl(dataUrl: string, fileName: string) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function createPreview(url: string) {
  return QRCode.toDataURL(url, previewQrOptions);
}

export function QrSection() {
  const [draftUrl, setDraftUrl] = useState("");
  const [confirmedUrl, setConfirmedUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [hasSavedTarget, setHasSavedTarget] = useState(false);
  const [isLocalAddress, setIsLocalAddress] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const [tableStand, setTableStand] = useState<TableStandLibrary>(
    createEmptyTableStandLibrary,
  );
  const [tableStandUploadPathPrefix, setTableStandUploadPathPrefix] = useState("");
  const [actionState, setActionState] = useState<ActionState>("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const validation = useMemo(
    () =>
      validateQrTargetUrl(draftUrl, {
        allowLocalHttp: process.env.NODE_ENV !== "production",
      }),
    [draftUrl],
  );
  const normalizedDraftUrl = validation.ok ? validation.url : draftUrl.trim();
  const hasUnsavedChanges = normalizedDraftUrl !== confirmedUrl;
  const isBusy = actionState !== "idle";
  const exportsDisabled =
    isBusy || hasUnsavedChanges || !confirmedUrl || !previewUrl;

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/admin/settings/qr", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as QrSettingsResponse;
        if (!response.ok) {
          throw new Error(payload.error || "Не удалось загрузить настройки QR.");
        }
        return payload;
      })
      .then(async (payload) => {
        const url = payload.qrTargetUrl ?? "";
        const preview = url ? await createPreview(url) : "";

        setDraftUrl(url);
        setConfirmedUrl(url);
        setPreviewUrl(preview);
        setHasSavedTarget(payload.isSaved);
        setIsLocalAddress(payload.isLocalAddress);
        setTableStand(payload.tableStand ?? createEmptyTableStandLibrary());
        setTableStandUploadPathPrefix(payload.tableStandUploadPathPrefix ?? "");
        setActionState("idle");
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить настройки QR.",
        );
        setActionState("idle");
      });

    return () => controller.abort();
  }, []);

  function updateDraftUrl(value: string) {
    setDraftUrl(value);
    setHasEdited(true);
    setMessage("");
    setError("");
  }

  async function generateQr() {
    if (!validation.ok || isBusy) return;

    setActionState("saving");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/settings/qr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrTargetUrl: validation.url }),
      });
      const payload = (await response.json()) as QrSettingsResponse;

      if (!response.ok || !payload.qrTargetUrl) {
        throw new Error(payload.error || "Не удалось сохранить адрес витрины.");
      }

      const preview = await createPreview(payload.qrTargetUrl);
      setDraftUrl(payload.qrTargetUrl);
      setConfirmedUrl(payload.qrTargetUrl);
      setPreviewUrl(preview);
      setHasSavedTarget(true);
      setIsLocalAddress(payload.isLocalAddress);
      setHasEdited(false);
      setMessage("QR-код сгенерирован и сохранен.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сгенерировать QR-код.",
      );
    } finally {
      setActionState("idle");
    }
  }

  async function downloadQr() {
    if (exportsDisabled) return;

    setActionState("qr");
    setError("");
    setMessage("");

    try {
      const dataUrl = await QRCode.toDataURL(confirmedUrl, {
        ...previewQrOptions,
        width: 2048,
      });
      downloadDataUrl(dataUrl, "kafema-qr.png");
      setMessage("Чистый QR скачан.");
    } catch {
      setError("Не удалось скачать QR-код. Попробуйте еще раз.");
    } finally {
      setActionState("idle");
    }
  }

  const fieldError = hasEdited && !validation.ok ? validation.error : "";

  return (
    <section className="rounded-[32px] border border-[#E6E6E6] bg-white p-5 shadow-[0_18px_44px_rgba(26,26,26,0.05)] sm:p-7">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h2 className="text-2xl font-black">QR-код витрины</h2>
          <p className="mt-2 text-sm leading-6 text-[#777777]">
            Укажите страницу, которая должна открываться после сканирования.
          </p>
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,0.43fr)_minmax(0,0.57fr)] xl:gap-x-10 xl:gap-y-5">
          <div className="min-w-0 xl:col-start-2 xl:row-start-1">
            <h3 className="text-xl font-black text-[#1A1A1A]">Адрес в QR-коде</h3>
            <label className="mt-4 block" htmlFor="qr-target-url">
              <span className="text-sm font-bold text-[#777777]">
                Адрес клиентской витрины
              </span>
            </label>
            <input
              id="qr-target-url"
              type="url"
              autoComplete="url"
              className="mt-2 h-12 w-full min-w-0 rounded-2xl border border-[#E6E6E6] bg-[#F7F7F7] px-4 font-semibold outline-none transition focus:border-[#E30613] disabled:text-[#A1A1AA]"
              disabled={actionState === "loading" || actionState === "saving"}
              inputMode="url"
              placeholder="https://example.com/menu"
              value={draftUrl}
              onChange={(event) => updateDraftUrl(event.target.value)}
            />
            <button
              type="button"
              className="mt-3 min-h-12 w-full rounded-2xl bg-[#E30613] px-5 font-black text-white shadow-[0_14px_28px_rgba(227,6,19,0.18)] transition hover:bg-[#C80010] disabled:cursor-not-allowed disabled:bg-[#EFEFEF] disabled:text-[#777777] disabled:shadow-none"
              disabled={!validation.ok || isBusy}
              onClick={() => void generateQr()}
            >
              {actionState === "saving"
                ? "Генерация..."
                : hasSavedTarget
                  ? "Перегенерировать QR-код"
                  : "Сгенерировать QR-код"}
            </button>

            <div className="mt-3 min-h-6 text-sm font-bold" aria-live="polite">
              {fieldError ? <p className="text-[#B42318]">{fieldError}</p> : null}
              {!fieldError && hasUnsavedChanges ? (
                <p className="text-[#9A6700]">
                  Есть несохраненные изменения. Сначала сгенерируйте новый QR-код.
                </p>
              ) : null}
              {!fieldError && !hasUnsavedChanges && confirmedUrl ? (
                <p className="text-[#177245]">QR-код актуален.</p>
              ) : null}
            </div>

            {isLocalAddress && !hasUnsavedChanges ? (
              <p className="mt-2 rounded-2xl bg-[#FFF7E6] px-4 py-3 text-sm font-semibold leading-6 text-[#7A4D00]">
                Сейчас используется локальный адрес. Перед публикацией укажите
                публичный HTTPS URL.
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 items-center justify-center xl:col-start-1 xl:row-span-2 xl:row-start-1">
            <div className="flex aspect-square w-full max-w-[340px] items-center justify-center rounded-3xl bg-[#F7F7F7] p-5 sm:p-7 xl:max-w-[360px]">
              {previewUrl ? (
                <Image
                  alt="QR-код клиентской витрины"
                  className="h-full w-full rounded-xl object-contain"
                  height={720}
                  src={previewUrl}
                  unoptimized
                  width={720}
                />
              ) : (
                <p className="max-w-[260px] text-center text-sm font-bold leading-6 text-[#777777]">
                  {actionState === "loading"
                    ? "Загружаем настройки QR..."
                    : "Укажите адрес и сгенерируйте QR-код."}
                </p>
              )}
            </div>
          </div>

          <div className="min-w-0 xl:col-start-2 xl:row-start-2">
            <div className="grid gap-3">
              {confirmedUrl ? (
                <a
                  className={`inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-[#E6E6E6] px-5 text-sm font-black transition ${
                    hasUnsavedChanges
                      ? "pointer-events-none text-[#A1A1AA]"
                      : "text-[#1A1A1A] hover:bg-[#F7F7F7]"
                  }`}
                  aria-disabled={hasUnsavedChanges}
                  href={hasUnsavedChanges ? undefined : confirmedUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Открыть ссылку
                </a>
              ) : null}
              <button
                type="button"
                className="min-h-12 w-full rounded-2xl border border-[#E6E6E6] bg-[#F7F7F7] px-5 font-black text-[#1A1A1A] transition hover:bg-[#EFEFEF] disabled:cursor-not-allowed disabled:bg-[#F7F7F7] disabled:text-[#A1A1AA]"
                disabled={exportsDisabled}
                onClick={() => void downloadQr()}
              >
                {actionState === "qr" ? "Подготовка..." : "Скачать чистый QR"}
              </button>
            </div>

            <div aria-live="polite" className="mt-3 min-h-6 text-sm font-bold">
              {error ? <p className="text-[#B42318]">{error}</p> : null}
              {!error && message ? <p className="text-[#177245]">{message}</p> : null}
            </div>
          </div>
        </div>

        {tableStandUploadPathPrefix ? (
          <TableStandEditor
            confirmedUrl={confirmedUrl}
            disabled={hasUnsavedChanges || !confirmedUrl}
            initialLibrary={tableStand}
            uploadPathPrefix={tableStandUploadPathPrefix}
            onLibraryChange={setTableStand}
          />
        ) : null}
      </div>
    </section>
  );
}
