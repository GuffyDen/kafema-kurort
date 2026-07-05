"use client";

type CartBarProps = {
  itemsCount: number;
  total: number;
  onOpen: () => void;
};

function formatItemsCount(count: number) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return `${count} товар`;
  }

  if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
    return `${count} товара`;
  }

  return `${count} товаров`;
}

export function CartBar({ itemsCount, total, onOpen }: CartBarProps) {
  if (itemsCount === 0) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-0 z-40 px-4"
      style={{ bottom: "calc(112px + env(safe-area-inset-bottom, 0px))" }}
    >
      <button
        type="button"
        className="mx-auto flex h-[60px] w-full max-w-md items-center justify-between rounded-full border border-white/60 bg-[#FFF9F0]/95 px-5 text-[var(--color-text-main)] shadow-[0_18px_40px_rgba(64,39,23,0.14)] backdrop-blur-xl transition duration-500 hover:bg-white active:scale-[0.99]"
        onClick={onOpen}
      >
        <span className="text-base font-bold">
          Корзина · {formatItemsCount(itemsCount)}
        </span>
        <span className="rounded-full bg-[#E30613] px-4 py-2 text-sm font-black text-white">
          {total.toLocaleString("ru-RU")} ₽
        </span>
      </button>
    </div>
  );
}
