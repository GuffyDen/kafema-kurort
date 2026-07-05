export type BottomNavigationItem = "menu" | "orders" | "sea" | "profile";

const navigationItems: Array<{
  id: BottomNavigationItem;
  icon: string;
  label: string;
}> = [
  { id: "menu", icon: "☕", label: "Меню" },
  { id: "orders", icon: "📦", label: "Заказы" },
  { id: "sea", icon: "🌊", label: "Мы у моря" },
  { id: "profile", icon: "👤", label: "Профиль" },
];

type BottomNavigationProps = {
  activeItem: BottomNavigationItem;
  onSelect: (item: BottomNavigationItem) => void;
};

export function BottomNavigation({
  activeItem,
  onSelect,
}: BottomNavigationProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[30px] border border-white/70 bg-[#FFF9F0]/92 p-2 shadow-[0_-10px_34px_rgba(64,39,23,0.12),0_18px_52px_rgba(64,39,23,0.10)] backdrop-blur-xl">
        {navigationItems.map((item) => {
          const active = activeItem === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[22px] px-1 text-[11px] font-semibold transition duration-500 active:scale-95 ${
                active
                  ? "bg-[#FFF0E7] text-[#E30613] shadow-[0_12px_24px_rgba(64,39,23,0.10)]"
                  : "text-[var(--color-text-main)] hover:bg-[#FFF7EA]"
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
