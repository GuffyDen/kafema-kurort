type EmptyStateProps = {
  text: string;
};

export function EmptyState({ text }: EmptyStateProps) {
  return (
    <div className="rounded-[24px] border border-dashed border-[#EFEFEF] bg-[#FFFFFF] px-5 py-6 text-center text-sm text-[#777777]">
      {text}
    </div>
  );
}
