export function Header() {
  return (
    <header className="flex justify-center">
      <div className="w-full rounded-[30px] border border-[#E8D9C8] bg-[var(--color-card)] px-5 py-5 text-center leading-none text-[var(--color-coffee)] shadow-[var(--shadow-soft)]">
        <p className="text-[clamp(1.7rem,8vw,2.45rem)] font-light tracking-[0.28em]">
          КАФЕМА
        </p>
        <p className="mt-2 text-sm font-semibold tracking-[0.48em] text-[var(--color-caramel)]">
          КУРОРТ
        </p>
      </div>
    </header>
  );
}
