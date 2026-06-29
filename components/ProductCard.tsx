"use client";

import Image from "next/image";

export type Product = {
  id: string;
  name: string;
  volume: string;
  price: number;
  image: string;
};

type ProductCardProps = {
  product: Product;
  onAdd: (product: Product) => void;
};

export function ProductCard({ product, onAdd }: ProductCardProps) {
  return (
    <article className="overflow-hidden rounded-[24px] border border-[#EFEFEF] bg-[#FFFFFF] shadow-[0_16px_36px_rgba(119,119,119,0.14)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(119,119,119,0.18)]">
      <div className="relative aspect-[1.08] overflow-hidden bg-[#F7F7F7]">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 430px) 50vw, 190px"
          className="object-cover"
        />
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E30613] text-2xl leading-none text-white shadow-[0_14px_26px_rgba(227,6,19,0.22)] transition duration-300 hover:bg-[#C90511] active:scale-95"
            onClick={() => onAdd(product)}
            aria-label={`Добавить ${product.name}`}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}
