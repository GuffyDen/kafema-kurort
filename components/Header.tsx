type HeaderProps = {
  cartCount?: number;
  onCartOpen?: () => void;
  variant?: "compact" | "hero";
};

export function Header({
  cartCount = 0,
  onCartOpen,
  variant = "compact",
}: HeaderProps) {
  if (variant === "hero") {
    return (
      <header className="relative -mx-4 -mt-5 min-h-[560px] overflow-hidden rounded-b-[34px] pb-9 pt-5 text-white shadow-[0_22px_54px_rgba(64,39,23,0.14)]">
        <div className="absolute inset-0">
          <img
            src="/client/kafema-sea-hero.jpg"
            alt=""
            className="h-full w-full object-cover object-[58%_50%]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#E30613_0%,rgba(227,6,19,0.92)_20%,rgba(231,62,42,0.62)_38%,rgba(248,213,189,0.24)_58%,rgba(255,246,232,0.04)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-52 bg-[linear-gradient(180deg,rgba(248,241,231,0)_0%,rgba(248,241,231,0.66)_62%,var(--color-bg-cream)_100%)]" />
          <div className="absolute -left-20 top-0 h-80 w-80 rounded-full bg-[#E30613]/75 blur-3xl" />
        </div>

        <div className="relative z-10 px-6 pt-7">
          <div className="flex items-start justify-between gap-4">
            <img
              src="/kafema-kurort-logo.png"
              alt="Кафема Курорт"
              className="h-auto w-[168px] object-contain"
            />
            {onCartOpen ? (
              <button
                type="button"
                className="mt-2 flex h-[52px] shrink-0 items-center gap-2 rounded-full bg-white/92 px-4 text-sm font-bold text-[var(--color-text-main)] shadow-[0_14px_30px_rgba(51,31,18,0.14)] backdrop-blur-xl transition duration-500 hover:bg-white active:scale-[0.98]"
                onClick={onCartOpen}
              >
                <span className="text-lg">🛍</span>
                <span>Корзина</span>
                {cartCount > 0 ? (
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#E30613] px-2 text-xs font-black text-white">
                    {cartCount}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>

          <div className="mt-[5.5rem] max-w-[18.5rem] drop-shadow-[0_3px_12px_rgba(43,28,20,0.30)]">
            <p className="font-serif text-[2.05rem] font-bold leading-[1.18] min-[380px]:text-[2.18rem]">
              <span className="block whitespace-nowrap">Мы у моря.</span>
              <span className="block whitespace-nowrap">Вы с кофе.</span>
            </p>
            <p className="mt-5 whitespace-pre-line font-serif text-[1.04rem] font-semibold leading-7 text-white/90">
              Вкусно.{"\n"}Спокойно.{"\n"}По-нашему.
            </p>
            <p className="mt-5 text-xl tracking-[0.16em] text-white/88">〰〰</p>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="flex items-center justify-between gap-4">
      <img
        src="/kafema-kurort-logo.png"
        alt="Кафема Курорт"
        className="h-auto w-[150px] object-contain"
      />
      {onCartOpen ? (
        <button
          type="button"
          className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--color-card)] px-4 text-sm font-bold text-[var(--color-text-main)] shadow-[var(--shadow-soft)] transition duration-500 active:scale-[0.98]"
          onClick={onCartOpen}
        >
          <span>Корзина</span>
          {cartCount > 0 ? (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#E30613] px-2 text-xs font-black text-white">
              {cartCount}
            </span>
          ) : null}
        </button>
      ) : null}
    </header>
  );
}
