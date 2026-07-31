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
      className={`overflow-hidden rounded-[24px] border border-[#EFE2D4] bg-[#FFF9F0] shadow-[0_16px_36px_rgba(64,39,23,0.08)] transition-[opacity,transform,box-shadow] duration-500 ease-out ${
        canAdd
          ? "hover:-translate-y-0.5 hover:shadow-[0_24px_48px_rgba(64,39,23,0.12)]"
          : "opacity-60"
      }`}
    >
      <div className="relative aspect-[1.08] overflow-hidden bg-[#EFE2D1]">
        {product.imageSrc ? (
          <img
            src={product.imageSrc}
            alt={product.name}
            className="h-full w-full object-cover"
            onError={(event) => {
              if (event.currentTarget.src.endsWith(fallbackImageSrc)) return;
              event.currentTarget.src = fallbackImageSrc;
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
            Фото скоро
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex flex-col items-start gap-1.5">
          {!canAdd ? (
            <span className="rounded-full bg-[#FFF9F0]/95 px-3 py-1 text-xs font-black text-[#8F2F24] shadow-sm backdrop-blur">
              Нет в наличии
            </span>
          ) : null}
          {product.badges.length > 0 ? (
            <div className="flex max-w-full flex-wrap items-center gap-1.5">
              {product.badges.map((badge) => (
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black shadow-sm backdrop-blur ${
                    badge === "hit"
                      ? "bg-[#E30613]/92 text-white"
                      : "bg-[#FFF9F0]/95 text-[#9A642B]"
                  }`}
                  key={badge}
                >
                  {badge === "hit" ? "Хит" : "Новинка"}
                </span>
              ))}
            </div>
          ) : null}
        </div>
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
            className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none shadow-[0_12px_24px_rgba(64,39,23,0.12)] transition-[color,background-color,opacity,transform,box-shadow] duration-500 ease-out active:scale-95 ${
              canAdd
                ? "border border-[#EAD8C2] bg-[#F4E5D2] text-[var(--color-text-main)] hover:bg-[#EFD5B3] active:bg-[#E6C399]"
                : "cursor-not-allowed bg-[#E8D9C8] text-[var(--color-text-muted)] opacity-70 shadow-none"
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
