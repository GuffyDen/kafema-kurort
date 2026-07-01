const navigationItems = ["Главная", "Меню", "Заказы", "Профиль"];

export function BottomNavigation() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E8D9C8] bg-[#F5EEE3]/90 px-4 pb-5 pt-3 shadow-[0_-12px_30px_rgba(73,52,36,0.10)] backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2 rounded-[28px] bg-[var(--color-card)] p-2 shadow-[var(--shadow-soft)]">
        {navigationItems.map((item, index) => (
          <button
            key={item}
            className={`h-12 rounded-[18px] px-2 text-xs font-semibold transition duration-300 active:scale-95 ${
              index === 0
                ? "bg-[#BD8649] text-white shadow-[0_12px_22px_rgba(189,134,73,0.20)]"
                : "bg-[#FFF7EA] text-[var(--color-text-muted)] shadow-[0_8px_18px_rgba(73,52,36,0.08)] hover:bg-[#F8E2C3] hover:text-[var(--color-text-main)]"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </nav>
  );
}
