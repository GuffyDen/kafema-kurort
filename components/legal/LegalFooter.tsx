import Link from "next/link";

const legalLinks = [
  { href: "/legal/offer", label: "Публичная оферта" },
  { href: "/legal/privacy", label: "Политика конфиденциальности" },
  {
    href: "/legal/personal-data-consent",
    label: "Согласие на обработку ПД",
  },
] as const;

export function LegalFooter() {
  return (
    <footer className="mt-10 border-t border-[#DCCBB8]/80 pt-6 text-center text-[var(--color-text-muted)]">
      <div className="text-xs font-semibold leading-5">
        <p>ИП Галимская Александра Михайловна</p>
        <p className="mt-1">
          ИНН 253717959668
          <span aria-hidden="true"> · </span>
          <span className="whitespace-nowrap">ОГРНИП 325253600079861</span>
        </p>
      </div>

      <address className="mt-3 flex flex-col items-center justify-center gap-1 text-sm not-italic sm:flex-row sm:gap-3">
        <a
          href="tel:+79084429670"
          className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold underline decoration-[#BDAA96] underline-offset-4 transition-colors hover:text-[var(--color-text-main)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649]"
        >
          +7 (908) 442-96-70
        </a>
        <a
          href="mailto:Cherepanovaam@inbox.ru"
          className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold underline decoration-[#BDAA96] underline-offset-4 transition-colors hover:text-[var(--color-text-main)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649]"
        >
          Cherepanovaam@inbox.ru
        </a>
      </address>

      <nav
        aria-label="Юридическая информация"
        className="mt-4 flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2"
      >
        {legalLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold underline decoration-[#BDAA96] underline-offset-4 transition-colors hover:text-[var(--color-text-main)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649]"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
