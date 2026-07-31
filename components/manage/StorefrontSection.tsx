"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { fallbackImageSrc } from "@/lib/menuStore";
import type {
  StorefrontCategory,
  StorefrontCategoryOverride,
  StorefrontProduct,
  StorefrontProductOverride,
  StorefrontResponse,
} from "@/lib/storefrontTypes";

type RequestError = {
  error?: string;
  httpStatus?: number | null;
  correlationId?: string | null;
};

export function StorefrontSection() {
  const [storefront, setStorefront] = useState<StorefrontResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");

  const loadStorefront = useCallback(async () => {
    setIsLoading(true);

    try {
      setStorefront(await requestStorefront("/api/admin/storefront"));
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    requestStorefront("/api/admin/storefront")
      .then((next) => {
        if (cancelled) return;
        setStorefront(next);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function syncStorefront() {
    setIsSyncing(true);

    try {
      const next = await requestStorefront("/api/admin/storefront/sync", {
        method: "POST",
      });
      setStorefront(next);
      setError("");
      notifyStorefrontChanged();
    } catch (syncError) {
      setError(getErrorMessage(syncError));
    } finally {
      setIsSyncing(false);
    }
  }

  async function patchProduct(
    itemId: string,
    patch: Partial<Record<keyof StorefrontProductOverride, unknown>>,
  ) {
    const next = await requestStorefront(
      `/api/admin/storefront/products/${encodeURIComponent(itemId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    setStorefront(next);
    notifyStorefrontChanged();
  }

  async function resetProduct(itemId: string) {
    const next = await requestStorefront(
      `/api/admin/storefront/products/${encodeURIComponent(itemId)}/overrides`,
      { method: "DELETE" },
    );
    setStorefront(next);
    notifyStorefrontChanged();
  }

  async function patchCategory(
    categoryId: string,
    patch: Partial<Record<keyof StorefrontCategoryOverride, unknown>>,
  ) {
    const next = await requestStorefront(
      `/api/admin/storefront/categories/${encodeURIComponent(categoryId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    setStorefront(next);
    notifyStorefrontChanged();
  }

  if (isLoading && !storefront) {
    return <StorefrontState title="Загружаем External Menu из iiko..." />;
  }

  if (!storefront) {
    return (
      <StorefrontState
        title="Не удалось загрузить витрину"
        description={error || "Попробуйте повторить проверку позже."}
        actionLabel="Повторить"
        onAction={() => void loadStorefront()}
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-[#E9E1D7] bg-white p-5 shadow-[0_18px_50px_rgba(36,24,16,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#E30613]">
              External Menu
            </p>
            <h2 className="mt-2 text-2xl font-black text-[#3B2F2A]">
              {storefront.externalMenu.name || "Без названия"}
            </h2>
            <p className="mt-2 text-sm font-bold text-[#777777]">
              Последняя синхронизация: {formatDate(storefront.syncedAt)}
            </p>
          </div>
          <button
            className="rounded-2xl bg-[#E30613] px-5 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(227,6,19,0.18)] disabled:cursor-wait disabled:opacity-60"
            disabled={isSyncing}
            onClick={() => void syncStorefront()}
            type="button"
          >
            {isSyncing ? "Обновляем..." : "Обновить из iiko"}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Metric label="Категории" value={storefront.categoriesCount} />
          <Metric label="Товары" value={storefront.productsCount} />
          <Metric label="Модификаторы" value={storefront.modifiersCount} />
        </div>

        {storefront.persistence.warning ? (
          <p
            className={`mt-4 rounded-2xl p-3 text-sm font-bold leading-6 ${
              storefront.persistence.writable
                ? "bg-[#FFF4D7] text-[#8A6500]"
                : "bg-[#FFE7E7] text-[#B00020]"
            }`}
          >
            {storefront.persistence.warning}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-2xl bg-[#FFE7E7] p-3 text-sm font-bold text-[#B00020]">
            {error}
          </p>
        ) : null}
      </section>

      {storefront.categories.length === 0 ? (
        <StorefrontState
          title="Внешнее меню пусто"
          description="iiko не вернула категории и товары."
        />
      ) : (
        storefront.categories.map((category) => (
          <CategoryEditor
            category={category}
            key={`${category.source.id}:${JSON.stringify(category.overrides)}`}
            writable={storefront.persistence.writable}
            onPatch={patchCategory}
            onPatchProduct={patchProduct}
            onResetProduct={resetProduct}
          />
        ))
      )}
    </div>
  );
}

function CategoryEditor({
  category,
  writable,
  onPatch,
  onPatchProduct,
  onResetProduct,
}: {
  category: StorefrontCategory;
  writable: boolean;
  onPatch: (
    categoryId: string,
    patch: Partial<Record<keyof StorefrontCategoryOverride, unknown>>,
  ) => Promise<void>;
  onPatchProduct: (
    itemId: string,
    patch: Partial<Record<keyof StorefrontProductOverride, unknown>>,
  ) => Promise<void>;
  onResetProduct: (itemId: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(
    category.overrides.displayName ?? "",
  );
  const [sortOrder, setSortOrder] = useState(
    String(category.overrides.sortOrder ?? category.display.sortOrder),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveCategory() {
    setIsSaving(true);

    try {
      await onPatch(category.source.id, {
        displayName: displayName.trim() || null,
        sortOrder: Number(sortOrder),
        isVisible: category.display.isVisible,
      });
      setMessage("Настройки категории сохранены");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleVisibility() {
    setIsSaving(true);

    try {
      await onPatch(category.source.id, {
        isVisible: !category.display.isVisible,
      });
      setMessage("Видимость категории обновлена");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <details className="rounded-[28px] border border-[#E9E1D7] bg-[#FFFDF8] p-5" open>
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xl font-black text-[#3B2F2A]">
              {category.display.name}
            </p>
            <p className="mt-1 text-sm font-bold text-[#777777]">
              {category.products.length} товаров · Значение iiko:{" "}
              {category.source.name}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              category.display.isVisible
                ? "bg-[#ECF8EF] text-[#226B35]"
                : "bg-[#F7F7F7] text-[#777777]"
            }`}
          >
            {category.display.isVisible ? "Показывается" : "Скрыта"}
          </span>
        </div>
      </summary>

      <div className="mt-5 grid gap-3 border-t border-[#E9E1D7] pt-5 md:grid-cols-[1fr_160px_auto_auto]">
        <Field
          label="Название категории для сайта"
          value={displayName}
          placeholder={category.source.name}
          changed={category.overrides.displayName !== undefined}
          onChange={setDisplayName}
        />
        <Field
          label="Сортировка"
          type="number"
          value={sortOrder}
          changed={category.overrides.sortOrder !== undefined}
          onChange={setSortOrder}
        />
        <button
          className="self-end rounded-2xl border border-[#E9E1D7] bg-white px-4 py-3 text-sm font-black text-[#3B2F2A] disabled:opacity-50"
          disabled={!writable || isSaving}
          onClick={() => void toggleVisibility()}
          type="button"
        >
          {category.display.isVisible ? "Скрыть" : "Показывать"}
        </button>
        <button
          className="self-end rounded-2xl bg-[#3B2F2A] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          disabled={!writable || isSaving}
          onClick={() => void saveCategory()}
          type="button"
        >
          {isSaving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>
      {message ? <StatusMessage message={message} /> : null}

      <div className="mt-5 grid gap-4">
        {category.products.map((product) => (
          <ProductEditor
            key={`${product.source.itemId}:${JSON.stringify(product.overrides)}`}
            product={product}
            writable={writable}
            onPatch={onPatchProduct}
            onReset={onResetProduct}
          />
        ))}
      </div>
    </details>
  );
}

function ProductEditor({
  product,
  writable,
  onPatch,
  onReset,
}: {
  product: StorefrontProduct;
  writable: boolean;
  onPatch: (
    itemId: string,
    patch: Partial<Record<keyof StorefrontProductOverride, unknown>>,
  ) => Promise<void>;
  onReset: (itemId: string) => Promise<void>;
}) {
  const [name, setName] = useState(product.overrides.displayName ?? "");
  const [description, setDescription] = useState(
    product.overrides.displayDescription ?? "",
  );
  const [price, setPrice] = useState(
    product.overrides.displayPrice === undefined
      ? ""
      : String(product.overrides.displayPrice),
  );
  const [image, setImage] = useState(product.overrides.displayImage ?? "");
  const [sortOrder, setSortOrder] = useState(
    String(product.overrides.sortOrder ?? product.display.sortOrder),
  );
  const [isVisible, setIsVisible] = useState(product.display.isVisible);
  const [badge, setBadge] = useState(product.display.badge);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveProduct() {
    setIsSaving(true);

    try {
      await onPatch(product.source.itemId, {
        displayName: name.trim() || null,
        displayDescription: description.trim() || null,
        displayPrice: price.trim() ? Number(price) : null,
        displayImage: image.trim() || null,
        sortOrder: Number(sortOrder),
        isVisible,
        badge,
      });
      setMessage("Изменения сохранены");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function resetField(field: keyof StorefrontProductOverride) {
    setIsSaving(true);

    try {
      await onPatch(product.source.itemId, { [field]: null });
      setMessage("Значение возвращено из iiko");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function resetAll() {
    setIsSaving(true);

    try {
      await onReset(product.source.itemId);
      setMessage("Все изменения товара сброшены");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  const displayImage = image.trim() || product.source.imageUrl;

  return (
    <article className="rounded-[24px] border border-[#E9E1D7] bg-white p-4 shadow-[0_12px_32px_rgba(36,24,16,0.06)]">
      <div className="grid gap-5 xl:grid-cols-[180px_1fr]">
        <div>
          <div className="aspect-square overflow-hidden rounded-2xl bg-[#F7F7F7]">
            {displayImage ? (
              <img
                alt={product.display.name}
                className="h-full w-full object-cover"
                src={displayImage}
                onError={(event) => {
                  event.currentTarget.src = fallbackImageSrc;
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm font-bold text-[#999999]">
                Фото отсутствует в iiko
              </div>
            )}
          </div>
          <p className="mt-3 text-xs font-bold leading-5 text-[#777777]">
            iiko: {product.source.name}
          </p>
          <p className="text-sm font-black text-[#3B2F2A]">
            Сайт: {product.display.name}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <OverrideField
            label="Название для сайта"
            sourceValue={product.source.name}
            changed={product.overrides.displayName !== undefined}
            onReset={() => void resetField("displayName")}
          >
            <input
              className={inputClass}
              placeholder={product.source.name}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </OverrideField>

          <OverrideField
            label="Цена для сайта"
            sourceValue={formatPrice(product.source.price)}
            changed={product.overrides.displayPrice !== undefined}
            onReset={() => void resetField("displayPrice")}
          >
            <input
              className={inputClass}
              min="0"
              placeholder={product.source.price === null ? "" : String(product.source.price)}
              type="number"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </OverrideField>

          <OverrideField
            label="Описание для сайта"
            sourceValue={product.source.description || "Описание отсутствует"}
            changed={product.overrides.displayDescription !== undefined}
            onReset={() => void resetField("displayDescription")}
          >
            <textarea
              className={`${inputClass} min-h-28 resize-y`}
              placeholder={product.source.description || "Описание отсутствует"}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </OverrideField>

          <OverrideField
            label="Фото для сайта"
            sourceValue={product.source.imageUrl || "Фото отсутствует"}
            changed={product.overrides.displayImage !== undefined}
            onReset={() => void resetField("displayImage")}
            resetLabel="Использовать фото из iiko"
          >
            <input
              className={inputClass}
              placeholder={product.source.imageUrl || "URL фотографии"}
              value={image}
              onChange={(event) => setImage(event.target.value)}
            />
          </OverrideField>

          <Field
            label="Сортировка"
            type="number"
            value={sortOrder}
            changed={product.overrides.sortOrder !== undefined}
            onChange={setSortOrder}
          />

          <div>
            <p className="text-xs font-black uppercase tracking-[0.08em] text-[#777777]">
              Отображение
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Toggle
                active={isVisible}
                label={isVisible ? "Показывать" : "Скрыто"}
                onClick={() => setIsVisible((current) => !current)}
              />
              <Toggle
                active={badge === "hit"}
                label="Хит"
                onClick={() => setBadge((current) => current === "hit" ? "none" : "hit")}
              />
              <Toggle
                active={badge === "new"}
                label="Новинка"
                onClick={() => setBadge((current) => current === "new" ? "none" : "new")}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <button
              className="rounded-2xl bg-[#3B2F2A] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              disabled={!writable || isSaving}
              onClick={() => void saveProduct()}
              type="button"
            >
              {isSaving ? "Сохраняем..." : "Сохранить товар"}
            </button>
            <button
              className="rounded-2xl border border-[#E9E1D7] bg-white px-5 py-3 text-sm font-black text-[#B00020] disabled:opacity-50"
              disabled={!writable || isSaving || Object.keys(product.overrides).length === 0}
              onClick={() => void resetAll()}
              type="button"
            >
              Сбросить все изменения товара
            </button>
          </div>

          {message ? <StatusMessage message={message} /> : null}

          <details className="rounded-2xl bg-[#F7F7F7] p-4 lg:col-span-2">
            <summary className="cursor-pointer text-sm font-black text-[#3B2F2A]">
              Техническая информация
            </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <TechnicalValue label="itemId" value={product.source.itemId} />
              <TechnicalValue label="SKU" value={product.source.sku || "Нет"} />
              <TechnicalValue label="Категория" value={product.source.categoryName} />
              <TechnicalValue
                label="Вес / объем"
                value={
                  product.source.portionWeightGrams === null
                    ? "Нет данных"
                    : `${product.source.portionWeightGrams} г`
                }
              />
              <TechnicalValue
                label="Теги"
                value={product.source.tags.join(", ") || "Нет"}
              />
              <TechnicalValue
                label="Labels"
                value={product.source.labels.join(", ") || "Нет"}
              />
            </div>

            <div className="mt-5 space-y-3">
              {product.source.itemSizes.length === 0 ? (
                <p className="text-sm font-bold text-[#777777]">Размеры отсутствуют.</p>
              ) : (
                product.source.itemSizes.map((size) => (
                  <div className="rounded-2xl bg-white p-4" key={size.id}>
                    <p className="font-black text-[#3B2F2A]">
                      Размер: {size.name || "Основной"} · {formatPrice(size.price)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-[#777777]">
                      Вес: {size.portionWeightGrams ?? "Нет данных"} г
                    </p>
                    {size.modifierGroups.map((group) => (
                      <div className="mt-3" key={group.id}>
                        <p className="text-sm font-black text-[#3B2F2A]">
                          {group.name} · min {group.minQuantity} / max {group.maxQuantity}
                        </p>
                        <ul className="mt-2 space-y-1 text-sm font-bold text-[#777777]">
                          {group.options.map((option) => (
                            <li key={option.itemId}>
                              {option.name} · {formatPrice(option.price)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </details>
        </div>
      </div>
    </article>
  );
}

function OverrideField({
  label,
  sourceValue,
  changed,
  onReset,
  resetLabel = "Вернуть значение из iiko",
  children,
}: {
  label: string;
  sourceValue: string;
  changed: boolean;
  onReset: () => void;
  resetLabel?: string;
  children: ReactNode;
}) {
  return (
    <label>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-[0.08em] text-[#777777]">
          {label}
        </span>
        {changed ? (
          <span className="rounded-full bg-[#FFF4D7] px-2 py-1 text-[10px] font-black text-[#8A6500]">
            Изменено в Tablo
          </span>
        ) : null}
      </span>
      <span className="mt-1 block break-words text-xs font-bold text-[#999999]">
        Значение iiko: {sourceValue}
      </span>
      <span className="mt-2 block">{children}</span>
      {changed ? (
        <button
          className="mt-2 text-xs font-black text-[#E30613]"
          onClick={onReset}
          type="button"
        >
          {resetLabel}
        </button>
      ) : null}
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  changed = false,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  changed?: boolean;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label>
      <span className="flex items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#777777]">
        {label}
        {changed ? (
          <span className="normal-case tracking-normal text-[#8A6500]">
            Изменено в Tablo
          </span>
        ) : null}
      </span>
      <input
        className={`${inputClass} mt-2`}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-11 rounded-2xl border px-3 text-xs font-black ${
        active
          ? "border-[#E30613] bg-[#FFE7E7] text-[#B00020]"
          : "border-[#E9E1D7] bg-white text-[#777777]"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#F7F7F7] p-3 text-center">
      <p className="text-xl font-black text-[#3B2F2A]">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#777777]">{label}</p>
    </div>
  );
}

function TechnicalValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#777777]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black text-[#3B2F2A]">{value}</p>
    </div>
  );
}

function StatusMessage({ message }: { message: string }) {
  const isError = /ошиб|не удалось|настроено/i.test(message);

  return (
    <p
      className={`rounded-2xl p-3 text-sm font-bold lg:col-span-2 ${
        isError
          ? "bg-[#FFE7E7] text-[#B00020]"
          : "bg-[#ECF8EF] text-[#226B35]"
      }`}
    >
      {message}
    </p>
  );
}

function StorefrontState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-[#E9E1D7] bg-white p-8 text-center">
      <p className="text-xl font-black text-[#3B2F2A]">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-xl text-sm font-bold leading-6 text-[#777777]">
          {description}
        </p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          className="mt-5 rounded-2xl bg-[#3B2F2A] px-5 py-3 text-sm font-black text-white"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

async function requestStorefront(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  const payload = (await response.json()) as StorefrontResponse & RequestError;

  if (!response.ok) {
    const details = [
      payload.error,
      payload.httpStatus ? `HTTP ${payload.httpStatus}` : null,
      payload.correlationId ? `Correlation ID: ${payload.correlationId}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    throw new Error(details || "Не удалось выполнить запрос");
  }

  return payload;
}

function notifyStorefrontChanged() {
  localStorage.setItem("tablo-storefront-updated-at", String(Date.now()));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось сохранить изменения";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatPrice(value: number | null) {
  return value === null ? "Цена отсутствует" : `${value.toLocaleString("ru-RU")} ₽`;
}

const inputClass =
  "w-full rounded-2xl border border-[#E9E1D7] bg-[#FFFDF8] px-4 py-3 text-sm font-bold text-[#3B2F2A] outline-none transition focus:border-[#C78A45]";
