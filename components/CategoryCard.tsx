type CategoryCardProps = {
  icon: string;
  name: string;
  active?: boolean;
};

export function CategoryCard({ icon, name, active = false }: CategoryCardProps) {
  return (
    <button
      className={`flex shrink-0 items-center gap-3 rounded-[18px] border px-4 py-3 transition duration-300 active:scale-[0.98] ${
        active
          ? "border-[#E30613] bg-[#FFFFFF] text-[#E30613] shadow-[0_14px_28px_rgba(227,6,19,0.12)]"
          : "border-[#EFEFEF] bg-[#FFFFFF] text-[#1A1A1A] shadow-[0_12px_26px_rgba(119,119,119,0.12)] hover:border-[#E30613]/20"
      }`}
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
          active ? "bg-[#E30613] text-white" : "bg-[#F7F7F7]"
        }`}
      >
        {icon}
      </span>
      <span className="whitespace-nowrap text-sm font-semibold">{name}</span>
    </button>
  );
}
