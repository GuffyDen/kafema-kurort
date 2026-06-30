"use client";

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/components/ProductCard";
import {
  configureMenuItem,
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
  const [selection, setSelection] = useState<MenuSelection>(() =>
    getDefaultMenuSelection(menu, product),
  );
  const variants = useMemo(() => getAvailableVariants(product), [product]);
  const addonGroups = useMemo(
    () => getMenuItemAddonGroups(menu, product),
    [menu, product],
  );
  const configuredItem = useMemo(
    () => configureMenuItem(menu, product, selection),
    [menu, product, selection],
  );
  const canAdd = isMenuSelectionComplete(menu, product, selection);

  useEffect(() => {
    setSelection(getDefaultMenuSelection(menu, product));
  }, [menu, product]);

  function selectVariant(variantId: string) {
    setSelection((current) => ({ ...current, variantId }));
  }

  function selectSingleOption(groupId: string, optionId: string | null) {
    setSelection((current) => ({
      ...current,
      addonOptionIdsByGroupId: {
        ...current.addonOptionIdsByGroupId,
        [groupId]: optionId ? [optionId] : [],
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
    <div className="fixed inset-0 z-50 flex items-center bg-[#F7F7F7] px-4 py-8">
      <div className="mx-auto flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_24px_56px_rgba(119,119,119,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#EFEFEF] px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-[#777777]">Настройка</p>
            <h2 className="mt-1 text-2xl font-bold text-[#1A1A1A]">
              {product.name}
            </h2>
            <p className="mt-1 text-sm text-[#777777]">{product.description}</p>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-2xl leading-none text-[#1A1A1A] shadow-[0_8px_18px_rgba(119,119,119,0.14)] transition duration-300 hover:bg-[#F7F7F7] active:scale-95"
            onClick={onClose}
            aria-label="Закрыть настройку товара"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {variants.length > 0 ? (
            <section>
              <h3 className="text-base font-bold text-[#1A1A1A]">Вариант</h3>
              <div className="mt-3 space-y-2">
                {variants.map((variant) => (
                  <label
                    className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-[#EFEFEF] px-4 py-3"
                    key={variant.id}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="variant"
                        checked={selection.variantId === variant.id}
                        onChange={() => selectVariant(variant.id)}
                      />
                      <span className="font-semibold text-[#1A1A1A]">
                        {variant.name}
                      </span>
                    </span>
                    {variant.priceDelta > 0 ? (
                      <span className="text-sm font-bold text-[#777777]">
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
            return (
              <section key={group.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold text-[#1A1A1A]">
                    {group.icon} {group.name}
                  </h3>
                  <span className="text-xs font-semibold text-[#777777]">
                    {group.required ? "Обязательно" : "Необязательно"}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {!group.required && group.selectionType === "single" ? (
                    <label className="flex min-h-12 items-center rounded-[18px] border border-[#EFEFEF] px-4 py-3">
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name={`group-${group.id}`}
                          checked={selectedIds.length === 0}
                          onChange={() => selectSingleOption(group.id, null)}
                        />
                        <span className="font-semibold text-[#777777]">
                          Без дополнения
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
                        className="flex min-h-12 items-center justify-between gap-3 rounded-[18px] border border-[#EFEFEF] px-4 py-3"
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
                                : selectSingleOption(group.id, option.id)
                            }
                          />
                          <span className="font-semibold text-[#1A1A1A]">
                            {option.name}
                          </span>
                        </span>
                        {option.priceDelta > 0 ? (
                          <span className="text-sm font-bold text-[#777777]">
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

        <div className="border-t border-[#EFEFEF] bg-white px-5 pb-5 pt-4">
          <button
            type="button"
            className="h-[60px] w-full rounded-[24px] bg-[#E30613] px-5 text-base font-bold text-white shadow-[0_18px_34px_rgba(227,6,19,0.24)] transition duration-300 hover:bg-[#C90511] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#EFEFEF] disabled:text-[#777777] disabled:shadow-none"
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
