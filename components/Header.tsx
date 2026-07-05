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
      <header className="relative -mx-4 -mt-5 min-h-[580px] overflow-hidden rounded-b-[34px] pb-9 pt-5 text-white shadow-[0_22px_54px_rgba(64,39,23,0.14)]">
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
          <div className="relative min-h-[156px]">
            <img
              src="/kafema-kurort-logo.png"
              alt="Кафема Курорт"
              className="-ml-9 -mt-10 h-auto w-[302px] object-contain drop-shadow-[0_10px_28px_rgba(45,24,14,0.26)]"
            />
            {onCartOpen ? (
              <button
                type="button"
                className="absolute right-0 top-2 flex h-[54px] shrink-0 items-center gap-2 rounded-full border border-white/65 bg-white/86 px-4 text-sm font-bold text-[var(--color-text-main)] shadow-[0_16px_34px_rgba(51,31,18,0.14)] backdrop-blur-2xl transition duration-500 hover:bg-white/96 active:scale-[0.98]"
                onClick={onCartOpen}
              >
                <ShoppingBagIcon />
                <span>Корзина</span>
                {cartCount > 0 ? (
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#E30613] px-2 text-xs font-black text-white shadow-[0_6px_14px_rgba(227,6,19,0.22)]">
                    {cartCount}
                  </span>
                ) : null}
              </button>
            ) : null}
          </div>

          <div className="mt-5 max-w-[18.5rem] drop-shadow-[0_3px_12px_rgba(43,28,20,0.30)]">
            <p className="font-serif text-[2rem] font-bold leading-[1.18] min-[380px]:text-[2.12rem]">
              <span className="block whitespace-nowrap">Мы у моря.</span>
              <span className="block whitespace-nowrap">Вы с кофе.</span>
            </p>
            <p className="mt-4 whitespace-pre-line font-serif text-[1.02rem] font-semibold leading-7 text-white/90">
              Вкусно.{"\n"}Спокойно.{"\n"}По-нашему.
            </p>
            <p className="mt-4 text-xl tracking-[0.16em] text-white/88">〰〰</p>
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

function ShoppingBagIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M7.5 8.5V7a4.5 4.5 0 0 1 9 0v1.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M5.4 8.5h13.2l1 11.2a2 2 0 0 1-2 2.2H6.4a2 2 0 0 1-2-2.2l1-11.2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
