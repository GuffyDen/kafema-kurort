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
      className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-3 transition duration-500 active:scale-[0.98] ${
        active
          ? "border-[#E30613] bg-[#E30613] text-white shadow-[0_16px_30px_rgba(227,6,19,0.16)]"
          : "border-[#E9DDCF] bg-[#FFF9F0]/92 text-[var(--color-text-main)] shadow-[0_10px_26px_rgba(64,39,23,0.06)] hover:border-[#DCC9B5] hover:bg-white"
      }`}
      onClick={onClick}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full text-base ${
          active ? "bg-white/16 text-white" : "bg-[#F2E7D9]"
        }`}
      >
        {icon}
      </span>
      <span className="whitespace-nowrap text-sm font-semibold">{name}</span>
    </button>
  );
}
