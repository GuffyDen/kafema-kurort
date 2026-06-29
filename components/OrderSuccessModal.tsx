"use client";

type OrderSuccessModalProps = {
  orderNumber: string;
  onBackToMenu: () => void;
};

export function OrderSuccessModal({
  orderNumber,
  onBackToMenu,
}: OrderSuccessModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center bg-[#F7F7F7] px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-[32px] bg-[#FFFFFF] px-6 py-8 text-center shadow-[0_24px_56px_rgba(119,119,119,0.22)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E30613] text-3xl text-white">
          ✓
        </div>

        <h2 className="mt-6 text-3xl font-bold text-[#1A1A1A]">
          Заказ принят
        </h2>

        <p className="mt-6 text-sm font-semibold text-[#777777]">
          Ваш номер:
        </p>
        <p className="mt-2 text-4xl font-bold text-[#E30613]">
          №{orderNumber}
        </p>

        <p className="mx-auto mt-6 max-w-xs text-base leading-7 text-[#1A1A1A]">
          Покажите этот номер бариста при получении заказа.
        </p>

        <button
          type="button"
          className="mt-8 h-[60px] w-full rounded-[24px] bg-[#E30613] px-5 text-base font-bold text-white shadow-[0_18px_34px_rgba(227,6,19,0.24)] transition duration-300 hover:bg-[#C90511] active:scale-[0.99]"
          onClick={onBackToMenu}
        >
          Вернуться в меню
        </button>
      </div>
    </div>
  );
}
