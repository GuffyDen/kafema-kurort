type CategoryCardProps = {
  icon: string;
  name: string;
  active?: boolean;
  onClick?: () => void;
};

export function CategoryCard({
  icon,
  name,
  active = false,
  onClick,
}: CategoryCardProps) {
  return (
    <button
      type="button"
      className={`flex shrink-0 items-center gap-3 rounded-[22px] border px-4 py-3 transition duration-300 active:scale-[0.98] ${
        active
          ? "border-[var(--color-caramel)] bg-[#FFF7EA] text-[var(--color-caramel)] shadow-[0_16px_34px_rgba(189,134,73,0.18)]"
          : "border-[#E8D9C8] bg-[var(--color-card)] text-[var(--color-text-main)] shadow-[var(--shadow-soft)] hover:border-[var(--color-caramel)]"
      }`}
      onClick={onClick}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
          active ? "bg-[var(--color-caramel)] text-white" : "bg-[#F2E7D9]"
        }`}
      >
        {icon}
      </span>
      <span className="whitespace-nowrap text-sm font-semibold">{name}</span>
    </button>
  );
}
