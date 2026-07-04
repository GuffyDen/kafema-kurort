export type BaristaCardSize = "compact" | "standard" | "large";

export type BaristaSettings = {
  showSource: boolean;
  online: boolean;
  cashier: boolean;
  delivery: boolean;
  sound: boolean;
  autoScroll: boolean;
  cardSize: BaristaCardSize;
};

export const baristaSettingsStorageKey = "kafema_barista_settings";

export const defaultBaristaSettings: BaristaSettings = {
  showSource: true,
  online: true,
  cashier: true,
  delivery: false,
  sound: true,
  autoScroll: true,
  cardSize: "standard",
};

export function getStoredBaristaSettings(): BaristaSettings {
  if (typeof window === "undefined") return defaultBaristaSettings;

  const savedSettings = window.localStorage.getItem(baristaSettingsStorageKey);

  if (!savedSettings) return defaultBaristaSettings;

  try {
    const parsedSettings = JSON.parse(savedSettings) as Partial<BaristaSettings>;

    return normalizeBaristaSettings(parsedSettings);
  } catch {
    return defaultBaristaSettings;
  }
}

export function saveBaristaSettings(settings: BaristaSettings) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    baristaSettingsStorageKey,
    JSON.stringify(normalizeBaristaSettings(settings)),
  );
}

function normalizeBaristaSettings(
  settings: Partial<BaristaSettings>,
): BaristaSettings {
  return {
    ...defaultBaristaSettings,
    ...settings,
    cardSize: isBaristaCardSize(settings.cardSize)
      ? settings.cardSize
      : defaultBaristaSettings.cardSize,
  };
}

function isBaristaCardSize(value: unknown): value is BaristaCardSize {
  return value === "compact" || value === "standard" || value === "large";
}
