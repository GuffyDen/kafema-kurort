import Link from "next/link";
import type { ReactNode } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { Header } from "@/components/Header";

export const legalLinkClassName =
  "font-bold text-[#9A6032] underline decoration-[#D2B89E] underline-offset-4 hover:text-[#6F4325] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649]";

type LegalDocumentProps = {
  children: ReactNode;
  documentTitle: string;
  introduction: ReactNode;
  revision: string;
  title: string;
};

export function LegalDocument({
  children,
  documentTitle,
  introduction,
  revision,
  title,
}: LegalDocumentProps) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[var(--color-bg-cream)] text-[var(--color-text-main)]">
      <BackgroundDecor />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.25rem+env(safe-area-inset-top,0px))] sm:px-6 sm:pt-8">
        <Header />

        <nav aria-label="Навигация по юридической странице" className="mt-5">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#E1D1BF] bg-[var(--color-card)] px-4 text-sm font-bold text-[var(--color-text-main)] shadow-[0_10px_24px_rgba(64,39,23,0.08)] transition duration-300 hover:border-[#C8B29A] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#BD8649] active:scale-[0.98]"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ←
            </span>
            Назад
          </Link>
        </nav>

        <header className="mt-8 sm:mt-10">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#BD8649]">
            Юридическая информация
          </p>
          <h1 className="mt-3 max-w-3xl font-serif text-[2.3rem] font-bold leading-[1.04] tracking-[-0.03em] text-[var(--color-text-main)] min-[380px]:text-[2.45rem] sm:text-5xl">
            {title}
          </h1>
        </header>

        <article className="mt-7 rounded-[28px] border border-white/70 bg-[var(--color-card)] px-5 py-7 shadow-[var(--shadow-soft)] sm:mt-9 sm:rounded-[36px] sm:px-10 sm:py-10">
          <div className="border-b border-[#E5D6C5] pb-7 sm:pb-8">
            <h2 className="font-serif text-2xl font-bold leading-tight sm:text-[2rem]">
              {documentTitle}
            </h2>
            <p className="mt-4 text-sm font-bold text-[#BD8649]">{revision}</p>
            <div className="mt-5 text-base leading-7 text-[#59483B] sm:text-[1.05rem] sm:leading-8">
              {introduction}
            </div>
          </div>

          <div className="divide-y divide-[#EADFD3]">{children}</div>
        </article>
      </div>
    </main>
  );
}

export function LegalSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="py-7 first:pt-8 sm:py-9 sm:first:pt-10">
      <h2 className="font-serif text-xl font-bold leading-snug text-[var(--color-text-main)] sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[0.98rem] leading-7 text-[#59483B] sm:mt-5 sm:text-base sm:leading-8">
        {children}
      </div>
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-[#BD8649]">
      {children}
    </ul>
  );
}
