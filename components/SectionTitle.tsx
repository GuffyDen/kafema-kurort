type SectionTitleProps = {
  title: string;
  subtitle?: string;
};

export function SectionTitle({ title, subtitle }: SectionTitleProps) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-[#1A1A1A]">{title}</h2>
      {subtitle ? (
        <p className="mt-1 text-sm leading-5 text-[#777777]">{subtitle}</p>
      ) : null}
    </div>
  );
}
