"use client";

import { useMemo, useState } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import type { Product } from "@/components/ProductCard";
import {
  configureMenuItem,
  fallbackImageSrc,
  getAvailableVariants,
  getDefaultMenuSelection,
  getMenuItemAddonGroups,
  isMenuSelectionComplete,
  type ConfiguredMenuItem,
  type MenuSelection,
  type MenuState,
} from "@/lib/menuStore";

type ProductConfiguratorProps = {
  product: Product;
  menu: MenuState;
  onClose: () => void;
  onAdd: (configuredItem: ConfiguredMenuItem, selection: MenuSelection) => void;
};

export function ProductConfigurator({
  product,
  menu,
  onClose,
  onAdd,
}: ProductConfiguratorProps) {
  const currentProduct = useMemo(
    () => menu.menuItems.find((item) => item.id === product.id) ?? product,
    [menu.menuItems, product],
  );
  const [selection, setSelection] = useState<MenuSelection>(() =>
    getDefaultMenuSelection(menu, currentProduct),
  );
  const variants = useMemo(() => getAvailableVariants(currentProduct), [currentProduct]);
  const addonGroups = useMemo(
    () => getMenuItemAddonGroups(menu, currentProduct),
    [menu, currentProduct],
  );
  const configuredItem = useMemo(
    () => configureMenuItem(menu, currentProduct, selection),
    [menu, currentProduct, selection],
  );
  const canAdd = isMenuSelectionComplete(menu, currentProduct, selection);

  function selectVariant(variantId: string) {
    setSelection((current) => ({ ...current, variantId }));
  }

  function selectSingleOption(
    groupId: string,
    optionId: string | null,
    required = false,
  ) {
    setSelection((current) => ({
      ...current,
      addonOptionIdsByGroupId: {
        ...current.addonOptionIdsByGroupId,
        [groupId]:
          optionId &&
          !(current.addonOptionIdsByGroupId[groupId] ?? []).includes(optionId)
            ? [optionId]
            : required
              ? current.addonOptionIdsByGroupId[groupId] ?? []
              : [],
      },
    }));
  }

  function toggleMultipleOption(groupId: string, optionId: string) {
    setSelection((current) => {
      const selectedIds = current.addonOptionIdsByGroupId[groupId] ?? [];
      const nextIds = selectedIds.includes(optionId)
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId];

      return {
        ...current,
        addonOptionIdsByGroupId: {
          ...current.addonOptionIdsByGroupId,
          [groupId]: nextIds,
        },
      };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center overflow-hidden bg-[#F5EEE3]/95 px-4 py-8 backdrop-blur">
      <BackgroundDecor />
      <div className="relative z-10 mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[34px] bg-[#FFF9F0] shadow-[0_24px_64px_rgba(64,39,23,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#E8D9C8] px-5 py-5">
          <div>
            <h2 className="font-serif text-[2rem] font-bold leading-tight text-[var(--color-text-main)]">
              {currentProduct.name}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{currentProduct.description}</p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFF7EA] text-2xl leading-none text-[var(--color-text-main)] shadow-[0_8px_18px_rgba(73,52,36,0.10)] transition duration-300 hover:text-[var(--color-caramel)] active:scale-95"
            onClick={onClose}
            aria-label="Закрыть товар"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div className="relative aspect-[1.35] overflow-hidden rounded-[28px] bg-[#EFE2D1] shadow-[0_14px_34px_rgba(64,39,23,0.08)]">
            <img
              src={currentProduct.imageSrc}
              alt={currentProduct.name}
              className="h-full w-full object-cover"
              onError={(event) => {
                if (event.currentTarget.src.endsWith(fallbackImageSrc)) return;
                event.currentTarget.src = fallbackImageSrc;
              }}
            />
          </div>

          {variants.length > 0 ? (
            <section>
              <h3 className="font-serif text-xl font-bold text-[var(--color-text-main)]">Размер</h3>
              <div className="mt-3 space-y-2">
                {variants.map((variant) => (
                  <label
                    className="flex min-h-12 items-center justify-between gap-3 rounded-[22px] border border-[#E8D9C8] bg-white/72 px-4 py-3 shadow-[0_8px_20px_rgba(64,39,23,0.04)]"
                    key={variant.id}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="variant"
                        checked={selection.variantId === variant.id}
                        onChange={() => selectVariant(variant.id)}
                      />
                      <span className="font-semibold text-[var(--color-text-main)]">
                        {variant.name}
                      </span>
                    </span>
                    {variant.priceDelta > 0 ? (
                      <span className="text-sm font-bold text-[var(--color-text-muted)]">
                        +{variant.priceDelta.toLocaleString("ru-RU")} ₽
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </section>
          ) : null}

          {addonGroups.map((group) => {
            const selectedIds = selection.addonOptionIdsByGroupId[group.id] ?? [];
            const showEmptySingleOption =
              !group.required &&
              group.selectionType === "single" &&
              !isSugarGroupWithEmptyOption(group);
            return (
              <section key={group.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-black text-[var(--color-text-main)]">
                    {group.icon} {group.name}
                  </h3>
                  <span className="rounded-full bg-[#F2E7D9]/80 px-3 py-1 text-xs font-bold text-[var(--color-text-muted)]">
                    {group.required ? "Обязательно" : "Необязательно"}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {showEmptySingleOption ? (
                    <label className="flex min-h-12 items-center rounded-[22px] border border-[#E8D9C8] bg-white/72 px-4 py-3 shadow-[0_8px_20px_rgba(64,39,23,0.04)]">
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name={`group-${group.id}`}
                          checked={selectedIds.length === 0}
                          onChange={() => selectSingleOption(group.id, null)}
                        />
                        <span className="font-semibold text-[var(--color-text-muted)]">
                          Не добавлять
                        </span>
                      </span>
                    </label>
                  ) : null}

                  {group.options.map((option) => {
                    const checked = selectedIds.includes(option.id);
                    const inputType =
                      group.selectionType === "multiple" ? "checkbox" : "radio";

                    return (
                      <label
                        className="flex min-h-12 items-center justify-between gap-3 rounded-[22px] border border-[#E8D9C8] bg-white/72 px-4 py-3 shadow-[0_8px_20px_rgba(64,39,23,0.04)]"
                        key={option.id}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type={inputType}
                            name={`group-${group.id}`}
                            checked={checked}
                            onChange={() =>
                              group.selectionType === "multiple"
                                ? toggleMultipleOption(group.id, option.id)
                                : selectSingleOption(group.id, option.id, group.required)
                            }
                            onClick={() => {
                              if (group.selectionType === "single" && checked) {
                                selectSingleOption(group.id, option.id, group.required);
                              }
                            }}
                          />
                          <span className="font-semibold text-[var(--color-text-main)]">
                            {option.name}
                          </span>
                        </span>
                        {option.priceDelta > 0 ? (
                          <span className="text-sm font-bold text-[var(--color-text-muted)]">
                            +{option.priceDelta.toLocaleString("ru-RU")} ₽
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="border-t border-[#E8D9C8] bg-[var(--color-card)] px-5 pb-5 pt-4">
          <button
            type="button"
            className="h-[60px] w-full rounded-[28px] bg-[var(--color-caramel)] px-5 text-base font-black text-white shadow-[0_18px_34px_rgba(189,134,73,0.26)] transition duration-300 hover:bg-[#A86F34] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#E8D9C8] disabled:text-[var(--color-text-muted)] disabled:shadow-none"
            disabled={!canAdd}
            onClick={() => onAdd(configuredItem, selection)}
          >
            Добавить в корзину · {configuredItem.unitPrice.toLocaleString("ru-RU")} ₽
          </button>
        </div>
      </div>
    </div>
  );
}

function isSugarGroupWithEmptyOption(group: {
  id: string;
  name: string;
  options: Array<{ name: string }>;
}) {
  const isSugarGroup =
    group.id.toLowerCase().includes("sugar") ||
    group.name.toLowerCase().includes("сахар");

  return (
    isSugarGroup &&
    group.options.some((option) => option.name.toLowerCase().includes("без сахара"))
  );
}
