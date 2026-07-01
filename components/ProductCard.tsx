"use client";

import {
  getMenuItemPrice,
  getMenuItemSummary,
  type MenuItem,
} from "@/lib/menuStore";

export type Product = MenuItem;

type ProductCardProps = {
  product: Product;
  onAdd: (product: Product) => void;
};

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const canAdd = product.inStock;
  const price = getMenuItemPrice(product);
  const summary = getMenuItemSummary(product);

  return (
    <article
      className={`overflow-hidden rounded-[30px] border border-[#E8D9C8] bg-[var(--color-card)] shadow-[var(--shadow-soft)] transition duration-300 ${
        canAdd
          ? "hover:-translate-y-0.5 hover:shadow-[0_28px_62px_rgba(73,52,36,0.16)]"
          : "opacity-60"
      }`}
    >
      <div className="relative aspect-[1.08] overflow-hidden bg-[#EFE2D1]">
        <img
          src={product.imageSrc}
          alt={product.name}
          className="h-full w-full object-cover"
        />
        {!canAdd ? (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--color-card)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)] shadow-sm">
            Нет в наличии
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <h3 className="truncate text-base font-bold text-[var(--color-text-main)]">
          {product.name}
        </h3>
        <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">{summary}</p>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-lg font-black text-[var(--color-text-main)]">
            {price.toLocaleString("ru-RU")} ₽
          </p>
          <button
            type="button"
            className={`flex h-11 w-11 items-center justify-center rounded-[14px] text-2xl leading-none shadow-[0_14px_26px_rgba(189,134,73,0.18)] transition duration-300 active:scale-95 ${
              canAdd
                ? "border border-[#E8CBA7] bg-[#F8E2C3] text-[#9A642B] hover:bg-[#EFC58F] active:bg-[#DDBF99]"
                : "cursor-not-allowed bg-[#E8D9C8] text-[var(--color-text-muted)] shadow-none"
            }`}
            onClick={() => onAdd(product)}
            disabled={!canAdd}
            aria-label={`Добавить ${product.name}`}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
