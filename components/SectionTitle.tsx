type SectionTitleProps = {
  title: string;
  subtitle?: string;
};

export function SectionTitle({ title, subtitle }: SectionTitleProps) {
  return (
    <div>
      <h2 className="text-xl font-black text-[var(--color-text-main)]">{title}</h2>
      {subtitle ? (
        <p className="mt-1 text-sm leading-5 text-[var(--color-text-muted)]">{subtitle}</p>
      ) : null}
    </div>
  );
}
