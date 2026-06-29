const navigationItems = ["Главная", "Меню", "Заказы", "Профиль"];

export function BottomNavigation() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#EFEFEF] bg-[#FFFFFF] px-4 pb-5 pt-3 shadow-[0_-12px_30px_rgba(119,119,119,0.12)]">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2 rounded-[24px] bg-[#FFFFFF] p-2">
        {navigationItems.map((item, index) => (
          <button
            key={item}
            className={`h-12 rounded-[18px] px-2 text-xs font-semibold transition duration-300 active:scale-95 ${
              index === 0
                ? "bg-[#E30613] text-white shadow-[0_12px_22px_rgba(227,6,19,0.20)]"
                : "text-[#777777] hover:text-[#1A1A1A]"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
    </nav>
  );
}
