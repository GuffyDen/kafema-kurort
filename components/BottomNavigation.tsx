export type BottomNavigationItem = "menu" | "orders" | "profile";

const navigationItems: Array<{ id: BottomNavigationItem; label: string }> = [
  { id: "menu", label: "Меню" },
  { id: "orders", label: "Заказы" },
  { id: "profile", label: "Профиль" },
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
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E8D9C8] bg-[#F5EEE3]/90 px-4 pb-5 pt-3 shadow-[0_-12px_30px_rgba(73,52,36,0.10)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-3 gap-2 rounded-[28px] bg-[var(--color-card)] p-2 shadow-[var(--shadow-soft)]">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`h-12 rounded-[18px] px-2 text-xs font-semibold transition duration-300 active:scale-95 ${
              activeItem === item.id
                ? "bg-[#BD8649] text-white shadow-[0_12px_22px_rgba(189,134,73,0.20)]"
                : "bg-[#FFF7EA] text-[var(--color-text-muted)] shadow-[0_8px_18px_rgba(73,52,36,0.08)] hover:bg-[#F8E2C3] hover:text-[var(--color-text-main)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
