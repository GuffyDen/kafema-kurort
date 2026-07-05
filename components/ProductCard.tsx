"use client";

import {
  getMenuItemPrice,
  getMenuItemSummary,
  fallbackImageSrc,
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
      className={`overflow-hidden rounded-[24px] border border-[#EFE2D4] bg-[#FFF9F0] shadow-[0_16px_36px_rgba(64,39,23,0.08)] transition duration-500 ${
        canAdd
          ? "hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(64,39,23,0.12)]"
          : "opacity-60"
      }`}
    >
      <div className="relative aspect-[1.08] overflow-hidden bg-[#EFE2D1]">
        <img
          src={product.imageSrc}
          alt={product.name}
          className="h-full w-full object-cover"
          onError={(event) => {
            if (event.currentTarget.src.endsWith(fallbackImageSrc)) return;
            event.currentTarget.src = fallbackImageSrc;
          }}
        />
        {!canAdd ? (
          <span className="absolute left-3 top-3 rounded-full bg-[#FFF9F0]/92 px-3 py-1 text-xs font-bold text-[var(--color-text-muted)] shadow-sm backdrop-blur">
            Нет в наличии
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <h3 className="truncate font-serif text-[1.22rem] font-bold leading-tight text-[var(--color-text-main)]">
          {product.name}
        </h3>
        <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-[var(--color-text-main)]/75">
          {summary}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xl font-black text-[var(--color-text-main)]">
            {price.toLocaleString("ru-RU")} ₽
          </p>
          <button
            type="button"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none shadow-[0_12px_24px_rgba(64,39,23,0.12)] transition duration-500 active:scale-95 ${
              canAdd
                ? "border border-[#EAD8C2] bg-[#F4E5D2] text-[var(--color-text-main)] hover:bg-[#EFD5B3] active:bg-[#E6C399]"
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
