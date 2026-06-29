"use client";

import type { MenuProduct } from "@/lib/menuStore";

export type Product = MenuProduct;

type ProductCardProps = {
  product: Product;
  onAdd: (product: Product) => void;
};

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const canAdd = product.inStock;

  return (
    <article
      className={`overflow-hidden rounded-[24px] border border-[#EFEFEF] bg-[#FFFFFF] shadow-[0_16px_36px_rgba(119,119,119,0.14)] transition duration-300 ${
        canAdd
          ? "hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(119,119,119,0.18)]"
          : "opacity-60"
      }`}
    >
      <div className="relative aspect-[1.08] overflow-hidden bg-[#F7F7F7]">
        <img
          src={product.imageSrc}
          alt={product.name}
          className="h-full w-full object-cover"
        />
        {!canAdd ? (
          <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-bold text-[#777777] shadow-sm">
            Нет в наличии
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <h3 className="truncate text-base font-semibold text-[#1A1A1A]">
          {product.name}
        </h3>
        <p className="mt-1 text-sm text-[#777777]">{product.volume}</p>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-lg font-bold text-[#1A1A1A]">
            {product.price.toLocaleString("ru-RU")} ₽
          </p>
          <button
            type="button"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none shadow-[0_14px_26px_rgba(227,6,19,0.22)] transition duration-300 active:scale-95 ${
              canAdd
                ? "bg-[#E30613] text-white hover:bg-[#C90511]"
                : "cursor-not-allowed bg-[#EFEFEF] text-[#777777] shadow-none"
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
