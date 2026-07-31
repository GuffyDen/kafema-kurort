"use client";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { fallbackImageSrc } from "@/lib/menuStore";
import type {
  StorefrontAdminResponse,
  StorefrontCategory,
  StorefrontCategoryOverride,
  StorefrontModifierOption,
  StorefrontProduct,
  StorefrontProductOverride,
  StorefrontSyncStatus,
} from "@/lib/storefrontTypes";

type RequestError = {
  error?: string;
  httpStatus?: number | null;
  correlationId?: string | null;
};

type StorefrontViewMode = "all" | "categories" | "products" | "modifiers";

type ModifierEntry = {
  itemId: string;
  option: StorefrontModifierOption;
  relations: string[];
};

type CategoryDragState = {
  categoryId: string;
  pointerId: number;
  startOrder: string[];
};

type CategoryDragPosition = {
  clientX: number;
  clientY: number;
};

type OrderFeedback = {
  type: "success" | "error";
  message: string;
};

const viewModeStorageKey = "tablo-storefront-editor-mode";
const listPageSize = 40;

export function StorefrontSection() {
  const [storefront, setStorefront] =
    useState<StorefrontAdminResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<StorefrontViewMode>(
    getStoredViewMode,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(listPageSize);
  const [orderedCategoryIds, setOrderedCategoryIds] = useState<string[]>([]);
  const [confirmedCategoryIds, setConfirmedCategoryIds] = useState<string[]>(
    [],
  );
  const [isOrderDirty, setIsOrderDirty] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(
    null,
  );
  const [dropTargetCategoryId, setDropTargetCategoryId] = useState<
    string | null
  >(null);
  const [orderFeedback, setOrderFeedback] =
    useState<OrderFeedback | null>(null);
  const orderedCategoryIdsRef = useRef<string[]>([]);
  const dragStateRef = useRef<CategoryDragState | null>(null);
  const dragPositionRef = useRef<CategoryDragPosition | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const categoryListRef = useRef<HTMLDivElement | null>(null);
  const orderedCategories = useMemo(() => {
    const sourceCategories = storefront?.categories ?? [];
    const categoryById = new Map(
      sourceCategories.map((category) => [category.source.id, category]),
    );
    const ordered = orderedCategoryIds
      .map((categoryId) => categoryById.get(categoryId))
      .filter((category): category is StorefrontCategory => Boolean(category));
    const orderedIds = new Set(ordered.map((category) => category.source.id));

    return [
      ...ordered,
      ...sourceCategories.filter(
        (category) => !orderedIds.has(category.source.id),
      ),
    ];
  }, [orderedCategoryIds, storefront]);
  const changedOrderCategoryIds = useMemo(() => {
    if (!isOrderDirty) return new Set<string>();

    return new Set(
      orderedCategoryIds.filter(
        (categoryId, index) =>
          confirmedCategoryIds[index] !== categoryId,
      ),
    );
  }, [confirmedCategoryIds, isOrderDirty, orderedCategoryIds]);
  const products = useMemo(
    () =>
      storefront?.categories.flatMap((category) => category.products) ?? [],
    [storefront],
  );
  const modifiers = useMemo(
    () => createModifierEntries(storefront?.categories ?? []),
    [storefront],
  );
  const normalizedQuery = normalizeSearch(searchQuery);
  const filteredCategories = useMemo(
    () =>
      orderedCategories.filter((category) =>
        matchesSearch(
          [category.display.name, category.source.name],
          normalizedQuery,
        ),
      ),
    [normalizedQuery, orderedCategories],
  );
  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        matchesSearch(
          [
            product.display.name,
            product.source.name,
            product.source.categoryName,
            product.source.sku ?? "",
          ],
          normalizedQuery,
        ),
      ),
    [normalizedQuery, products],
  );
  const filteredModifiers = useMemo(
    () =>
      modifiers.filter((modifier) =>
        matchesSearch(
          [modifier.option.name, modifier.option.sourceName],
          normalizedQuery,
        ),
      ),
    [modifiers, normalizedQuery],
  );

  async function loadStorefront() {
    setIsLoading(true);

    try {
      const next = await requestStorefront("/api/admin/storefront");
      const nextOrder = getCategoryIds(next);
      setStorefront(next);
      setConfirmedCategoryIds(nextOrder);
      setOrderedCategoryIds(nextOrder);
      orderedCategoryIdsRef.current = nextOrder;
      setIsOrderDirty(false);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    requestStorefront("/api/admin/storefront")
      .then((next) => {
        if (cancelled) return;
        const nextOrder = getCategoryIds(next);
        setStorefront(next);
        setConfirmedCategoryIds(nextOrder);
        setOrderedCategoryIds(nextOrder);
        orderedCategoryIdsRef.current = nextOrder;
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

  useEffect(
    () => () => {
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
      }
    },
    [],
  );

  async function syncStorefront() {
    setIsSyncing(true);

    try {
      const next = await requestStorefront("/api/admin/storefront/sync", {
        method: "POST",
      });
      if (!isOrderDirty) {
        const nextOrder = getCategoryIds(next);
        setConfirmedCategoryIds(nextOrder);
        setOrderedCategoryIds(nextOrder);
        orderedCategoryIdsRef.current = nextOrder;
      }
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

  function applyCategoryOrder(nextOrder: string[], animate = true) {
    const positions = animate ? captureCategoryPositions(categoryListRef.current) : null;

    orderedCategoryIdsRef.current = nextOrder;
    setOrderedCategoryIds(nextOrder);
    setIsOrderDirty(!areOrdersEqual(nextOrder, confirmedCategoryIds));
    setOrderFeedback(null);

    if (positions) {
      animateCategoryPositions(categoryListRef.current, positions);
    }
  }

  function moveCategory(categoryId: string, targetIndex: number) {
    const currentOrder = orderedCategoryIdsRef.current;
    const currentIndex = currentOrder.indexOf(categoryId);
    const boundedTargetIndex = Math.max(
      0,
      Math.min(targetIndex, currentOrder.length - 1),
    );

    if (currentIndex < 0 || currentIndex === boundedTargetIndex) return;

    const nextOrder = [...currentOrder];
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(boundedTargetIndex, 0, categoryId);
    applyCategoryOrder(nextOrder);
  }

  function beginCategoryDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    categoryId: string,
  ) {
    if (
      storefront?.persistence.writable !== true ||
      isSavingOrder ||
      normalizedQuery ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      categoryId,
      pointerId: event.pointerId,
      startOrder: [...orderedCategoryIdsRef.current],
    };
    dragPositionRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setDraggedCategoryId(categoryId);
    setDropTargetCategoryId(categoryId);
    setOrderFeedback(null);
  }

  function moveCategoryDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    dragPositionRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
    };
    updateDraggedCategoryTarget(event.clientX, event.clientY);
    scheduleCategoryAutoScroll();
  }

  function updateDraggedCategoryTarget(clientX: number, clientY: number) {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    const target = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-category-id]");
    const targetCategoryId = target?.dataset.categoryId;

    if (!targetCategoryId || targetCategoryId === dragState.categoryId) return;

    const currentOrder = orderedCategoryIdsRef.current;
    const currentIndex = currentOrder.indexOf(dragState.categoryId);
    const targetIndex = currentOrder.indexOf(targetCategoryId);
    const targetBounds = target.getBoundingClientRect();
    const targetMiddle = targetBounds.top + targetBounds.height / 2;

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      (currentIndex < targetIndex && clientY < targetMiddle) ||
      (currentIndex > targetIndex && clientY > targetMiddle)
    ) {
      return;
    }

    setDropTargetCategoryId(targetCategoryId);
    moveCategory(dragState.categoryId, targetIndex);
  }

  function scheduleCategoryAutoScroll() {
    if (dragScrollFrameRef.current !== null) return;

    const position = dragPositionRef.current;
    if (!position || getCategoryAutoScrollSpeed(position.clientY) === 0) return;

    dragScrollFrameRef.current = window.requestAnimationFrame(
      runCategoryAutoScroll,
    );
  }

  function runCategoryAutoScroll() {
    dragScrollFrameRef.current = null;
    const position = dragPositionRef.current;
    if (!dragStateRef.current || !position) return;

    const scrollSpeed = getCategoryAutoScrollSpeed(position.clientY);
    if (scrollSpeed === 0) return;

    window.scrollBy({ top: scrollSpeed, behavior: "auto" });
    updateDraggedCategoryTarget(position.clientX, position.clientY);
    dragScrollFrameRef.current = window.requestAnimationFrame(
      runCategoryAutoScroll,
    );
  }

  function finishCategoryDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    dragPositionRef.current = null;
    if (dragScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragScrollFrameRef.current);
      dragScrollFrameRef.current = null;
    }
    setDraggedCategoryId(null);
    setDropTargetCategoryId(null);
  }

  function cancelCategoryDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    applyCategoryOrder(dragState.startOrder);
    finishCategoryDrag(event);
  }

  function moveCategoryWithKeyboard(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    categoryId: string,
  ) {
    if (
      storefront?.persistence.writable !== true ||
      isSavingOrder ||
      normalizedQuery
    ) {
      return;
    }

    const currentIndex = orderedCategoryIdsRef.current.indexOf(categoryId);
    let targetIndex = currentIndex;

    if (event.key === "ArrowUp") targetIndex -= 1;
    if (event.key === "ArrowDown") targetIndex += 1;
    if (event.key === "Home") targetIndex = 0;
    if (event.key === "End") {
      targetIndex = orderedCategoryIdsRef.current.length - 1;
    }
    if (targetIndex === currentIndex) return;

    event.preventDefault();
    event.stopPropagation();
    moveCategory(categoryId, targetIndex);
  }

  function cancelCategoryOrder() {
    applyCategoryOrder([...confirmedCategoryIds]);
  }

  async function saveCategoryOrder() {
    const pendingOrder = [...orderedCategoryIdsRef.current];
    const previousOrder = [...confirmedCategoryIds];
    setIsSavingOrder(true);
    setOrderFeedback(null);

    try {
      const next = await requestStorefront(
        "/api/admin/storefront/categories/order",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order: pendingOrder.map((categoryId, index) => ({
              categoryId,
              sortOrder: (index + 1) * 10,
            })),
          }),
        },
      );
      setConfirmedCategoryIds(pendingOrder);
      orderedCategoryIdsRef.current = pendingOrder;
      setOrderedCategoryIds(pendingOrder);
      setIsOrderDirty(false);
      setStorefront(next);
      setOrderFeedback({
        type: "success",
        message: "Порядок категорий сохранен",
      });
      notifyStorefrontChanged();
    } catch (saveError) {
      orderedCategoryIdsRef.current = previousOrder;
      setOrderedCategoryIds(previousOrder);
      setIsOrderDirty(false);
      setOrderFeedback({
        type: "error",
        message: getErrorMessage(saveError),
      });
    } finally {
      setIsSavingOrder(false);
    }
  }

  function selectViewMode(nextMode: StorefrontViewMode) {
    const resolvedMode = viewMode === nextMode ? "all" : nextMode;

    setViewMode(resolvedMode);
    setSearchQuery("");
    setVisibleLimit(listPageSize);
    storeViewMode(resolvedMode);
  }

  function updateSearchQuery(value: string) {
    setSearchQuery(value);
    setVisibleLimit(listPageSize);
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

        <SyncStatus status={storefront.syncStatus} />

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

      <div className="sticky top-3 z-20 rounded-[24px] border border-[#E9E1D7] bg-white/95 p-3 shadow-[0_16px_40px_rgba(36,24,16,0.10)] backdrop-blur">
        <div
          aria-label="Режим редактора витрины"
          className="grid grid-cols-3 gap-2"
          role="group"
        >
          <ModeButton
            active={viewMode === "categories"}
            count={storefront.categoriesCount}
            label="Категории"
            onClick={() => selectViewMode("categories")}
          />
          <ModeButton
            active={viewMode === "products"}
            count={storefront.productsCount}
            label="Товары"
            onClick={() => selectViewMode("products")}
          />
          <ModeButton
            active={viewMode === "modifiers"}
            count={modifiers.length}
            label="Модификаторы"
            onClick={() => selectViewMode("modifiers")}
          />
        </div>

        {viewMode !== "all" ? (
          <label className="mt-3 block">
            <span className="sr-only">{getSearchLabel(viewMode)}</span>
            <input
              className={`${inputClass} bg-white`}
              onChange={(event) => updateSearchQuery(event.target.value)}
              placeholder={getSearchPlaceholder(viewMode)}
              type="search"
              value={searchQuery}
            />
          </label>
        ) : null}

        {viewMode === "categories" ? (
          <div className="mt-3" aria-live="polite">
            <span className="sr-only" id="category-order-help">
              Перетаскивайте категории мышкой или пальцем. Для управления с
              клавиатуры используйте стрелки вверх и вниз, Home и End.
            </span>
            {normalizedQuery ? (
              <p className="rounded-2xl bg-[#F7F7F7] px-4 py-3 text-sm font-bold text-[#777777]">
                Очистите поиск, чтобы изменить порядок категорий.
              </p>
            ) : null}
            {isOrderDirty ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#FFF4D7] px-4 py-3">
                <p className="text-sm font-black text-[#8A6500]">
                  Порядок изменен. Сохраните или отмените изменения.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-xl border border-[#E9E1D7] bg-white px-4 py-2 text-sm font-black text-[#3B2F2A] disabled:opacity-50"
                    disabled={isSavingOrder}
                    onClick={cancelCategoryOrder}
                    type="button"
                  >
                    Отменить
                  </button>
                  <button
                    className="rounded-xl bg-[#3B2F2A] px-4 py-2 text-sm font-black text-white disabled:cursor-wait disabled:opacity-50"
                    disabled={isSavingOrder}
                    onClick={() => void saveCategoryOrder()}
                    type="button"
                  >
                    {isSavingOrder ? "Сохраняем..." : "Сохранить порядок"}
                  </button>
                </div>
              </div>
            ) : orderFeedback ? (
              <p
                className={`rounded-2xl px-4 py-3 text-sm font-black ${
                  orderFeedback.type === "success"
                    ? "bg-[#ECF8EF] text-[#226B35]"
                    : "bg-[#FFE7E7] text-[#B00020]"
                }`}
              >
                {orderFeedback.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {viewMode === "all" ? (
        orderedCategories.length === 0 ? (
          <StorefrontState
            description="iiko не вернула категории и товары."
            title="Внешнее меню пусто"
          />
        ) : (
          orderedCategories.map((category) => (
            <CategoryEditor
              category={category}
              orderChanged={changedOrderCategoryIds.has(category.source.id)}
              key={`${category.source.id}:${JSON.stringify(category.overrides)}`}
              writable={storefront.persistence.writable}
              onPatch={patchCategory}
              onPatchProduct={patchProduct}
              onResetProduct={resetProduct}
            />
          ))
        )
      ) : null}

      {viewMode === "categories" ? (
        <StorefrontList
          emptyDescription="Попробуйте изменить поисковый запрос."
          emptyTitle="Категории не найдены"
          filteredCount={filteredCategories.length}
          hasSourceItems={orderedCategories.length > 0}
          onLoadMore={() =>
            setVisibleLimit((current) => current + listPageSize)
          }
          remainingCount={Math.max(
            0,
            filteredCategories.length - visibleLimit,
          )}
        >
          <div className="space-y-4" ref={categoryListRef}>
            {filteredCategories.slice(0, visibleLimit).map((category) => (
              <CategoryEditor
                category={category}
                dragHandle={
                  <CategoryDragHandle
                    categoryName={category.display.name}
                    disabled={
                      !storefront.persistence.writable ||
                      isSavingOrder ||
                      Boolean(normalizedQuery)
                    }
                    dragging={draggedCategoryId === category.source.id}
                    onKeyDown={(event) =>
                      moveCategoryWithKeyboard(event, category.source.id)
                    }
                    onPointerCancel={cancelCategoryDrag}
                    onPointerDown={(event) =>
                      beginCategoryDrag(event, category.source.id)
                    }
                    onPointerMove={moveCategoryDrag}
                    onPointerUp={finishCategoryDrag}
                  />
                }
                dropTarget={dropTargetCategoryId === category.source.id}
                dragging={draggedCategoryId === category.source.id}
                orderChanged={changedOrderCategoryIds.has(category.source.id)}
                key={`${category.source.id}:${JSON.stringify(category.overrides)}`}
                writable={storefront.persistence.writable}
                onPatch={patchCategory}
              />
            ))}
          </div>
        </StorefrontList>
      ) : null}

      {viewMode === "products" ? (
        <StorefrontList
          emptyDescription="Попробуйте изменить поисковый запрос."
          emptyTitle="Товары не найдены"
          filteredCount={filteredProducts.length}
          hasSourceItems={products.length > 0}
          onLoadMore={() =>
            setVisibleLimit((current) => current + listPageSize)
          }
          remainingCount={Math.max(0, filteredProducts.length - visibleLimit)}
        >
          {filteredProducts.slice(0, visibleLimit).map((product) => (
            <ProductEditor
              categoryLabel={product.source.categoryName}
              key={`${product.source.itemId}:${JSON.stringify(product.overrides)}`}
              product={product}
              writable={storefront.persistence.writable}
              onPatch={patchProduct}
              onReset={resetProduct}
            />
          ))}
        </StorefrontList>
      ) : null}

      {viewMode === "modifiers" ? (
        <StorefrontList
          emptyDescription="Попробуйте изменить поисковый запрос."
          emptyTitle="Модификаторы не найдены"
          filteredCount={filteredModifiers.length}
          hasSourceItems={modifiers.length > 0}
          onLoadMore={() =>
            setVisibleLimit((current) => current + listPageSize)
          }
          remainingCount={Math.max(0, filteredModifiers.length - visibleLimit)}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredModifiers.slice(0, visibleLimit).map((modifier) => (
              <ModifierEditor
                entry={modifier}
                key={`${modifier.itemId}:${JSON.stringify(modifier.option.overrides)}`}
                writable={storefront.persistence.writable}
                onPatch={patchProduct}
              />
            ))}
          </div>
        </StorefrontList>
      ) : null}
    </div>
  );
}

function CategoryEditor({
  category,
  writable,
  onPatch,
  onPatchProduct,
  onResetProduct,
  dragHandle,
  dragging = false,
  dropTarget = false,
  orderChanged = false,
}: {
  category: StorefrontCategory;
  writable: boolean;
  onPatch: (
    categoryId: string,
    patch: Partial<Record<keyof StorefrontCategoryOverride, unknown>>,
  ) => Promise<void>;
  onPatchProduct?: (
    itemId: string,
    patch: Partial<Record<keyof StorefrontProductOverride, unknown>>,
  ) => Promise<void>;
  onResetProduct?: (itemId: string) => Promise<void>;
  dragHandle?: ReactNode;
  dragging?: boolean;
  dropTarget?: boolean;
  orderChanged?: boolean;
}) {
  const [displayName, setDisplayName] = useState(
    category.overrides.displayName ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveCategory() {
    setIsSaving(true);

    try {
      await onPatch(category.source.id, {
        displayName: displayName.trim() || null,
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
    <details
      className={`rounded-[28px] border bg-[#FFFDF8] p-5 transition-[border-color,box-shadow,opacity,transform] duration-200 ${
        dragging
          ? "border-[#E30613] opacity-90 shadow-[0_18px_42px_rgba(36,24,16,0.16)]"
          : dropTarget
            ? "border-[#E30613] shadow-[inset_0_3px_0_#E30613]"
            : "border-[#E9E1D7]"
      }`}
      data-category-id={category.source.id}
      open
    >
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {dragHandle}
            <div>
              <p className="text-xl font-black text-[#3B2F2A]">
                {category.display.name}
              </p>
              <p className="mt-1 text-sm font-bold text-[#777777]">
                {category.products.length} товаров · Значение iiko:{" "}
                {category.source.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {orderChanged ? (
              <span className="rounded-full bg-[#FFF4D7] px-3 py-1 text-xs font-black text-[#8A6500]">
                Порядок изменен
              </span>
            ) : null}
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
        </div>
      </summary>

      <div className="mt-5 grid gap-3 border-t border-[#E9E1D7] pt-5 md:grid-cols-[1fr_auto_auto]">
        <Field
          label="Название категории для сайта"
          value={displayName}
          placeholder={category.source.name}
          changed={category.overrides.displayName !== undefined}
          onChange={setDisplayName}
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

      {onPatchProduct && onResetProduct ? (
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
      ) : null}
    </details>
  );
}

function ProductEditor({
  product,
  categoryLabel,
  writable,
  onPatch,
  onReset,
}: {
  product: StorefrontProduct;
  categoryLabel?: string;
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
  const [badges, setBadges] = useState(product.display.badges);
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
        badges,
        badge: null,
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

  function toggleBadge(badge: "hit" | "new") {
    setBadges((current) =>
      current.includes(badge)
        ? current.filter((currentBadge) => currentBadge !== badge)
        : [...current, badge],
    );
    setMessage("");
  }

  return (
    <article className="rounded-[24px] border border-[#E9E1D7] bg-white p-4 shadow-[0_12px_32px_rgba(36,24,16,0.06)] [contain-intrinsic-size:760px] [content-visibility:auto]">
      {categoryLabel ? (
        <p className="mb-4 text-xs font-black uppercase tracking-[0.08em] text-[#C46F28]">
          {categoryLabel}
        </p>
      ) : null}
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
                active={badges.includes("hit")}
                disabled={isSaving}
                label="Хит"
                onClick={() => toggleBadge("hit")}
              />
              <Toggle
                active={badges.includes("new")}
                disabled={isSaving}
                label="Новинка"
                onClick={() => toggleBadge("new")}
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

function ModifierEditor({
  entry,
  writable,
  onPatch,
}: {
  entry: ModifierEntry;
  writable: boolean;
  onPatch: (
    itemId: string,
    patch: Partial<Record<keyof StorefrontProductOverride, unknown>>,
  ) => Promise<void>;
}) {
  const [price, setPrice] = useState(
    entry.option.overrides.displayPrice === undefined
      ? ""
      : String(entry.option.overrides.displayPrice),
  );
  const [isVisible, setIsVisible] = useState(entry.option.isVisible);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveModifier() {
    setIsSaving(true);
    setMessage("");

    try {
      await onPatch(entry.itemId, {
        displayPrice: price.trim() ? Number(price) : null,
        isVisible,
      });
      setMessage("Модификатор сохранен");
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <article className="rounded-[24px] border border-[#E9E1D7] bg-white p-4 shadow-[0_12px_32px_rgba(36,24,16,0.06)] [contain-intrinsic-size:320px] [content-visibility:auto]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-[#3B2F2A]">
            {entry.option.name}
          </h3>
          <p className="mt-1 text-xs font-bold text-[#999999]">
            Значение iiko: {entry.option.sourceName}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
            isVisible
              ? "bg-[#ECF8EF] text-[#226B35]"
              : "bg-[#F7F7F7] text-[#777777]"
          }`}
        >
          {isVisible ? "Показывается" : "Скрыт"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Field
          changed={entry.option.overrides.displayPrice !== undefined}
          label="Цена для сайта"
          onChange={setPrice}
          placeholder={
            entry.option.sourcePrice === null
              ? ""
              : String(entry.option.sourcePrice)
          }
          type="number"
          value={price}
        />
        <button
          className="self-end rounded-2xl border border-[#E9E1D7] bg-white px-4 py-3 text-sm font-black text-[#3B2F2A] disabled:opacity-50"
          disabled={!writable || isSaving}
          onClick={() => setIsVisible((current) => !current)}
          type="button"
        >
          {isVisible ? "Скрыть" : "Показывать"}
        </button>
        <button
          className="self-end rounded-2xl bg-[#3B2F2A] px-4 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-50"
          disabled={!writable || isSaving}
          onClick={() => void saveModifier()}
          type="button"
        >
          {isSaving ? "Сохраняем..." : "Сохранить"}
        </button>
      </div>

      <div className="mt-4 border-t border-[#E9E1D7] pt-4">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-[#777777]">
          Используется в
        </p>
        <p className="mt-2 text-sm font-bold leading-6 text-[#777777]">
          {formatRelations(entry.relations)}
        </p>
        {entry.relations.length > 1 ? (
          <p className="mt-2 text-xs font-bold text-[#999999]">
            Изменение применяется ко всем связанным товарам.
          </p>
        ) : null}
      </div>

      {message ? (
        <div className="mt-4">
          <StatusMessage message={message} />
        </div>
      ) : null}
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
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`min-h-11 rounded-2xl border px-3 text-xs font-black ${
        active
          ? "border-[#E30613] bg-[#FFE7E7] text-[#B00020]"
          : "border-[#E9E1D7] bg-white text-[#777777]"
      } disabled:cursor-wait disabled:opacity-60`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function CategoryDragHandle({
  categoryName,
  disabled,
  dragging,
  onKeyDown,
  onPointerCancel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  categoryName: string;
  disabled: boolean;
  dragging: boolean;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      aria-describedby="category-order-help"
      aria-label={`Изменить порядок категории ${categoryName}`}
      className={`flex min-h-11 min-w-11 shrink-0 touch-none select-none items-center justify-center rounded-xl border text-lg font-black transition ${
        disabled
          ? "cursor-not-allowed border-[#E9E1D7] bg-[#F7F7F7] text-[#BBBBBB]"
          : dragging
            ? "cursor-grabbing border-[#E30613] bg-[#FFE7E7] text-[#B00020]"
            : "cursor-grab border-[#E9E1D7] bg-white text-[#777777] hover:border-[#CFC3B6] hover:text-[#3B2F2A]"
      }`}
      disabled={disabled}
      title={
        disabled
          ? "Очистите поиск, чтобы изменить порядок"
          : "Перетащить категорию. Стрелки вверх и вниз меняют позицию"
      }
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={onKeyDown}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <span aria-hidden="true">⋮⋮</span>
    </button>
  );
}

function ModeButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`min-h-14 rounded-2xl border px-2 py-2 text-center transition ${
        active
          ? "border-[#E30613] bg-[#FFE7E7] text-[#B00020] shadow-[0_8px_20px_rgba(227,6,19,0.10)]"
          : "border-transparent bg-[#F7F7F7] text-[#777777] hover:border-[#E9E1D7] hover:bg-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="block text-xs font-black sm:text-sm">{label}</span>
      <span className="mt-0.5 block text-base font-black">{count}</span>
    </button>
  );
}

function StorefrontList({
  children,
  emptyDescription,
  emptyTitle,
  filteredCount,
  hasSourceItems,
  onLoadMore,
  remainingCount,
}: {
  children: ReactNode;
  emptyDescription: string;
  emptyTitle: string;
  filteredCount: number;
  hasSourceItems: boolean;
  onLoadMore: () => void;
  remainingCount: number;
}) {
  if (!hasSourceItems) {
    return (
      <StorefrontState
        description="iiko не вернула данные для этого раздела."
        title="Раздел пока пуст"
      />
    );
  }

  if (filteredCount === 0) {
    return (
      <StorefrontState
        description={emptyDescription}
        title={emptyTitle}
      />
    );
  }

  return (
    <div className="space-y-4">
      {children}
      {remainingCount > 0 ? (
        <div className="flex justify-center pt-2">
          <button
            className="rounded-2xl border border-[#E9E1D7] bg-white px-5 py-3 text-sm font-black text-[#3B2F2A] shadow-[0_10px_24px_rgba(36,24,16,0.06)]"
            onClick={onLoadMore}
            type="button"
          >
            Показать еще · {Math.min(listPageSize, remainingCount)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SyncStatus({ status }: { status: StorefrontSyncStatus }) {
  const connection = getConnectionStatus(status);

  return (
    <div className="mt-4 rounded-2xl border border-[#E9E1D7] bg-[#FFFDF8] p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${connection.dotClass}`}
        />
        <p className={`text-sm font-black ${connection.textClass}`}>
          {connection.label}
        </p>
      </div>
      <div className="mt-3 grid gap-2 text-sm font-bold text-[#777777] md:grid-cols-3">
        <SyncValue
          label="Последняя синхронизация меню"
          value={formatRelativeDate(status.menuSyncedAt)}
        />
        <SyncValue
          label="Последнее обновление stop-list"
          value={
            status.stopListCheckedAt
              ? formatRelativeDate(status.stopListCheckedAt)
              : "Нет данных"
          }
        />
        <SyncValue
          label="Последняя ошибка"
          value={status.lastError?.message ?? "—"}
          isError={Boolean(status.lastError)}
        />
      </div>
    </div>
  );
}

function SyncValue({
  label,
  value,
  isError = false,
}: {
  label: string;
  value: string;
  isError?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-[#999999]">{label}</p>
      <p
        className={`mt-1 ${isError ? "text-[#B00020]" : "text-[#3B2F2A]"}`}
        suppressHydrationWarning
      >
        {value}
      </p>
    </div>
  );
}

function getConnectionStatus(status: StorefrontSyncStatus) {
  if (status.lastError && !status.stopListCheckedAt) {
    return {
      label: "Нет связи с iiko",
      dotClass: "bg-[#B00020]",
      textClass: "text-[#B00020]",
    };
  }

  if (status.lastError || status.stopListStale) {
    return {
      label: "Подключено, обновление задерживается",
      dotClass: "bg-[#D79B21]",
      textClass: "text-[#8A6500]",
    };
  }

  return {
    label: "Подключено к iiko",
    dotClass: "bg-[#2F8F4E]",
    textClass: "text-[#226B35]",
  };
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

function createModifierEntries(
  categories: StorefrontCategory[],
): ModifierEntry[] {
  const entries = new Map<
    string,
    {
      option: StorefrontModifierOption;
      relations: Set<string>;
    }
  >();

  categories.forEach((category) => {
    category.products.forEach((product) => {
      product.source.modifiers.forEach((group) => {
        group.options.forEach((option) => {
          const relation = [
            category.display.name,
            product.display.name,
            group.name,
          ].join(" · ");
          const current = entries.get(option.itemId);

          if (current) {
            current.relations.add(relation);
          } else {
            entries.set(option.itemId, {
              option,
              relations: new Set([relation]),
            });
          }
        });
      });
    });
  });

  return [...entries.entries()]
    .map(([itemId, entry]) => ({
      itemId,
      option: entry.option,
      relations: [...entry.relations].sort((first, second) =>
        first.localeCompare(second, "ru"),
      ),
    }))
    .sort((first, second) =>
      first.option.name.localeCompare(second.option.name, "ru"),
    );
}

function getStoredViewMode(): StorefrontViewMode {
  if (typeof window === "undefined") return "all";

  try {
    const stored = localStorage.getItem(viewModeStorageKey);
    return stored === "categories" ||
      stored === "products" ||
      stored === "modifiers" ||
      stored === "all"
      ? stored
      : "all";
  } catch {
    return "all";
  }
}

function storeViewMode(mode: StorefrontViewMode) {
  try {
    localStorage.setItem(viewModeStorageKey, mode);
  } catch {
    // The editor remains usable when browser storage is unavailable.
  }
}

function getSearchLabel(mode: StorefrontViewMode) {
  if (mode === "categories") return "Поиск по категориям";
  if (mode === "products") return "Поиск по товарам";
  return "Поиск по модификаторам";
}

function getSearchPlaceholder(mode: StorefrontViewMode) {
  if (mode === "categories") return "Найти категорию";
  if (mode === "products") return "Найти товар";
  return "Найти модификатор";
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function matchesSearch(values: string[], query: string) {
  if (!query) return true;

  return values.some((value) =>
    value.toLocaleLowerCase("ru-RU").includes(query),
  );
}

function getCategoryIds(storefront: StorefrontAdminResponse) {
  return storefront.categories.map((category) => category.source.id);
}

function areOrdersEqual(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((categoryId, index) => categoryId === second[index])
  );
}

function captureCategoryPositions(container: HTMLDivElement | null) {
  if (!container) return null;

  return new Map(
    [...container.querySelectorAll<HTMLElement>("[data-category-id]")].map(
      (element) => [
        element.dataset.categoryId ?? "",
        element.getBoundingClientRect().top,
      ],
    ),
  );
}

function animateCategoryPositions(
  container: HTMLDivElement | null,
  previousPositions: Map<string, number>,
) {
  if (
    !container ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }

  window.requestAnimationFrame(() => {
    container
      .querySelectorAll<HTMLElement>("[data-category-id]")
      .forEach((element) => {
        const previousTop = previousPositions.get(
          element.dataset.categoryId ?? "",
        );
        if (previousTop === undefined || typeof element.animate !== "function") {
          return;
        }

        const offset = previousTop - element.getBoundingClientRect().top;
        if (Math.abs(offset) < 1) return;

        element.animate(
          [
            { transform: `translateY(${offset}px)` },
            { transform: "translateY(0)" },
          ],
          {
            duration: 180,
            easing: "ease-out",
          },
        );
      });
  });
}

function getCategoryAutoScrollSpeed(clientY: number) {
  const edgeSize = Math.min(120, window.innerHeight * 0.2);

  if (clientY < edgeSize) {
    return -Math.ceil((edgeSize - clientY) / 6);
  }

  if (clientY > window.innerHeight - edgeSize) {
    return Math.ceil((clientY - (window.innerHeight - edgeSize)) / 6);
  }

  return 0;
}

function formatRelations(relations: string[]) {
  const visibleRelations = relations.slice(0, 3);
  const remaining = relations.length - visibleRelations.length;

  return remaining > 0
    ? `${visibleRelations.join("; ")} и еще ${remaining}`
    : visibleRelations.join("; ");
}

async function requestStorefront(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
  });
  const payload = (await response.json()) as StorefrontAdminResponse &
    RequestError;

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

function formatRelativeDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Нет данных";

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 5) return "только что";
  if (elapsedSeconds < 60) return `${elapsedSeconds} сек. назад`;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes} мин. назад`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} ч. назад`;

  return formatDate(value);
}

function formatPrice(value: number | null) {
  return value === null ? "Цена отсутствует" : `${value.toLocaleString("ru-RU")} ₽`;
}

const inputClass =
  "w-full rounded-2xl border border-[#E9E1D7] bg-[#FFFDF8] px-4 py-3 text-sm font-bold text-[#3B2F2A] outline-none transition focus:border-[#C78A45]";
