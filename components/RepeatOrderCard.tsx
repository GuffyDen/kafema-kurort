export function RepeatOrderCard() {
  return (
    <section className="rounded-[24px] border border-[#EFEFEF] bg-[#FFFFFF] p-4 shadow-[0_14px_32px_rgba(119,119,119,0.14)]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1A1A1A]">
            Ваш любимый заказ будет здесь
          </p>
          <p className="mt-1 text-sm leading-5 text-[#777777]">
            Заказывайте быстрее в следующий раз
          </p>
          <div className="mt-4 flex items-center gap-2 text-sm text-[#1A1A1A]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F7F7F7]">
              ☕
            </span>
            <span>Кофе и выпечка</span>
          </div>
        </div>

        <button className="shrink-0 rounded-full bg-[#E30613] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(227,6,19,0.22)] transition duration-300 hover:bg-[#C90511] active:scale-95">
          Заказать
        </button>
      </div>
    </section>
  );
}
