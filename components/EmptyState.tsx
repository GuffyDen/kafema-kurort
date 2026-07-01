type EmptyStateProps = {
  text: string;
};

export function EmptyState({ text }: EmptyStateProps) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#E8D9C8] bg-[var(--color-card)] px-5 py-6 text-center text-sm font-semibold text-[var(--color-text-muted)] shadow-[var(--shadow-soft)]">
      {text}
    </div>
  );
}
