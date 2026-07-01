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
      style={{ bottom: "calc(104px + env(safe-area-inset-bottom, 0px))" }}
    >
      <button
        type="button"
        className="mx-auto flex h-16 w-full max-w-md items-center justify-between rounded-[28px] bg-[var(--color-caramel)] px-5 text-white shadow-[0_20px_46px_rgba(189,134,73,0.28)] transition duration-300 hover:bg-[#A86F34] active:scale-[0.99]"
        onClick={onOpen}
      >
        <span className="text-base font-semibold">
          Корзина · {formatItemsCount(itemsCount)}
        </span>
        <span className="text-lg font-bold">{total.toLocaleString("ru-RU")} ₽</span>
      </button>
    </div>
  );
}
