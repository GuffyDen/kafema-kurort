"use client";

import { useEffect, useMemo, useState } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { BottomNavigation } from "@/components/BottomNavigation";
import type { BottomNavigationItem } from "@/components/BottomNavigation";
import { CartModal } from "@/components/CartModal";
import type { CartItem } from "@/components/CartModal";
import { CategoryCard } from "@/components/CategoryCard";
import { CheckoutModal } from "@/components/CheckoutModal";
import { EmptyState } from "@/components/EmptyState";
import { Header, HeroCartButton } from "@/components/Header";
import { OrderSuccessModal } from "@/components/OrderSuccessModal";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/components/ProductCard";
import { SearchBar } from "@/components/SearchBar";
import {
  getMenuItemWorkstationType,
  isDemoMenuItem,
  isMenuItemOrderable,
  useMenu,
  type ConfiguredMenuItem,
  type MenuSelection,
} from "@/lib/menuStore";
import { createOrder, useOrder, useOrders } from "@/lib/orderStore";
import type { Order } from "@/lib/orderStore";

export function HomeScreen() {
  const menu = useMenu();
  const [activeSection, setActiveSection] = useState<BottomNavigationItem>("menu");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(() =>
    getStoredActiveOrderId(),
  );
  const [isViewingOrderDetail, setIsViewingOrderDetail] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCartPinned, setIsCartPinned] = useState(
    () => typeof window !== "undefined" && window.scrollY > 48,
  );
  const orders = useOrders();
  const activeOrder = useOrder(activeOrderId);
  const clientOrders = useMemo(
    () =>
      orders
        .filter((order) => order.source === "client" && order.status !== "completed")
        .sort((firstOrder, secondOrder) => getOrderTime(firstOrder) - getOrderTime(secondOrder)),
    [orders],
  );
  const activeCategories = useMemo(
    () =>
      [...menu.categories]
        .filter((category) => category.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [menu.categories],
  );
  const visibleActiveCategoryId = useMemo(() => {
    if (!activeCategoryId) return null;
    return activeCategories.some((category) => category.id === activeCategoryId)
      ? activeCategoryId
      : null;
  }, [activeCategories, activeCategoryId]);
  const categories = useMemo(() => {
    return [
      {
        id: "all",
        name: "Все",
        iconSrc: getCategoryIconSrc("all", "Все"),
        active: visibleActiveCategoryId === null,
      },
      ...activeCategories.map((category) => ({
        id: category.id,
        name: category.name,
        iconSrc: getCategoryIconSrc(category.id, category.name),
        active: category.id === visibleActiveCategoryId,
      })),
    ];
  }, [activeCategories, visibleActiveCategoryId]);

  const products = useMemo(
    () =>
      menu.menuItems.filter(
        (product) => isMenuItemOrderable(menu, product) && !isDemoMenuItem(product),
      ),
    [menu],
  );
  const normalizedSearchQuery = normalizeSearch(searchQuery);
  const visibleProducts = useMemo(() => {
    const categoryProducts = visibleActiveCategoryId
      ? products.filter((product) => product.categoryId === visibleActiveCategoryId)
      : products;

    if (!normalizedSearchQuery) return categoryProducts;

    return categoryProducts.filter((product) =>
      [product.name, product.description].some((value) =>
        hasWordStartingWith(value, normalizedSearchQuery),
      ),
    );
  }, [normalizedSearchQuery, products, visibleActiveCategoryId]);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      ),
    [cartItems],
  );

  useEffect(() => {
    function updateCartPosition() {
      setIsCartPinned(window.scrollY > 48);
    }

    window.addEventListener("scroll", updateCartPosition, { passive: true });

    return () => window.removeEventListener("scroll", updateCartPosition);
  }, []);

  function addConfiguredItem(
    configuredItem: ConfiguredMenuItem,
    selection: MenuSelection,
  ) {
    const cartItemId = createCartItemId(configuredItem.item.id, selection);
    setCartItems((items) => {
      const existingItem = items.find((item) => item.id === cartItemId);

      if (existingItem) {
        return items.map((item) =>
          item.id === cartItemId
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...items,
        {
          id: cartItemId,
          product: configuredItem.item,
          selection,
          summary: configuredItem.summary,
          modifiers: configuredItem.baristaLines,
          unitPrice: configuredItem.unitPrice,
          quantity: 1,
        },
      ];
    });
    setSelectedProduct(null);
  }

  function increaseQuantity(cartItemId: string) {
    setCartItems((items) =>
      items.map((item) =>
        item.id === cartItemId
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      ),
    );
  }

  function decreaseQuantity(cartItemId: string) {
    setCartItems((items) =>
      items
        .map((item) =>
          item.id === cartItemId
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function openCheckout() {
    if (cartItems.length === 0) {
      return;
    }

    setIsCartOpen(false);
    setIsCheckoutOpen(true);
  }

  function confirmOrder(customer: {
    name: string;
    phone: string;
    comment?: string;
  }) {
    const order = createOrder({
      customerName: customer.name,
      phone: customer.phone,
      comment: customer.comment,
      items: cartItems.map((item) => ({
        id: item.product.id,
        name: item.product.name,
        volume: item.summary,
        modifiers: item.modifiers,
        baristaType: getMenuItemWorkstationType(item.product),
        categoryId: item.product.categoryId,
        categoryName: menu.categories.find(
          (category) => category.id === item.product.categoryId,
        )?.name,
        workingZoneId: item.product.workingZoneId,
        type: item.product.kind,
        quantity: item.quantity,
      })),
      total: cartTotal,
    });

    localStorage.setItem("kafema-active-order-id", order.id);
    setActiveOrderId(order.id);
    setIsViewingOrderDetail(true);
    setActiveSection("orders");
    setCartItems([]);
    setIsCheckoutOpen(false);
  }

  function returnToMenu() {
    setActiveSection("menu");
    setIsCartOpen(false);
    setIsCheckoutOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleNavigation(nextSection: BottomNavigationItem) {
    if (nextSection === "orders") {
      if (clientOrders.length === 1) {
        setActiveOrderId(clientOrders[0].id);
        setIsViewingOrderDetail(true);
      } else {
        setIsViewingOrderDetail(false);
      }
    }

    setActiveSection(nextSection);
  }

  function openOrder(orderId: string) {
    localStorage.setItem("kafema-active-order-id", orderId);
    setActiveOrderId(orderId);
    setIsViewingOrderDetail(true);
  }

  if (activeOrder && activeSection === "orders" && isViewingOrderDetail) {
    return (
      <OrderSuccessModal
        order={activeOrder}
        onBackToMenu={returnToMenu}
      />
    );
  }

  return (
    <>
      <main className="relative min-h-screen overflow-x-hidden bg-[var(--color-bg-cream)] text-[var(--color-text-main)]">
        <BackgroundDecor />
        <div className="relative z-10 mx-auto min-h-screen w-full max-w-md px-4 pb-44 pt-5">
          {activeSection === "menu" ? (
            <>
              <HeroCartButton
                cartCount={cartCount}
                onCartOpen={() => setIsCartOpen(true)}
                pinned={isCartPinned}
              />
              <Header
                variant="hero"
              />

              <div className="mt-6">
                <SearchBar value={searchQuery} onChange={setSearchQuery} />
              </div>

              <section className="mt-7">
                <div className="flex gap-3 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {categories.map((category) => (
                    <CategoryCard
                      key={category.name}
                      iconSrc={category.iconSrc}
                      name={category.name}
                      active={category.active}
                      onClick={() =>
                        setActiveCategoryId((currentCategoryId) => {
                          if (category.id === "all") return null;
                          return currentCategoryId === category.id ? null : category.id;
                        })
                      }
                    />
                  ))}
                </div>
              </section>

              <section className="mt-6">
                <div className="grid grid-cols-2 gap-4">
                  {visibleProducts.length > 0 ? (
                    visibleProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onAdd={setSelectedProduct}
                      />
                    ))
                  ) : (
                    <div className="col-span-2">
                      <EmptyState
                        text={
                          normalizedSearchQuery
                            ? "Ничего не найдено"
                            : "Пока в меню нет доступных товаров."
                        }
                      />
                    </div>
                  )}
                </div>
              </section>

              <button
                type="button"
                className="relative mt-6 flex h-36 w-full items-end justify-between overflow-hidden rounded-[28px] bg-[#2F4A45] p-5 text-left text-white shadow-[0_18px_42px_rgba(64,39,23,0.12)]"
                onClick={() => setActiveSection("sea")}
              >
                <img
                  src="/client/kafema-sea-atmosphere.jpg"
                  alt=""
                  className="absolute left-0 top-0 h-full w-full object-cover"
                />
                <span className="absolute inset-0 bg-[linear-gradient(90deg,rgba(39,54,50,0.74),rgba(39,54,50,0.12))]" />
                <span className="relative z-10">
                  <span className="block font-serif text-3xl font-bold">
                    Мы у моря
                  </span>
                  <span className="mt-2 block text-base font-semibold text-white/86">
                    Посмотреть атмосферу
                  </span>
                </span>
                <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF9F0]/92 text-2xl text-[var(--color-text-main)] shadow-[0_12px_24px_rgba(64,39,23,0.12)]">
                  ›
                </span>
              </button>
            </>
          ) : null}

          {activeSection === "orders" && !isViewingOrderDetail ? (
            clientOrders.length > 0 ? (
              <ClientOrdersList
                orders={clientOrders}
                onBackToMenu={() => setActiveSection("menu")}
                onOpenOrder={openOrder}
              />
            ) : (
              <ClientSectionPlaceholder
                title="У вас пока нет активного заказа"
                actionLabel="Перейти в меню"
                onAction={() => setActiveSection("menu")}
              />
            )
          ) : null}

          {activeSection === "profile" ? (
            <ClientSectionPlaceholder
              title="Вход по номеру телефона появится в ближайшем обновлении."
              actionLabel="Перейти в меню"
              onAction={() => setActiveSection("menu")}
            />
          ) : null}

          {activeSection === "sea" ? (
            <SeaSection onBackToMenu={() => setActiveSection("menu")} />
          ) : null}
        </div>
      </main>

      <BottomNavigation activeItem={activeSection} onSelect={handleNavigation} />

      {isCartOpen ? (
        <CartModal
          items={cartItems}
          total={cartTotal}
          onClose={() => setIsCartOpen(false)}
          onIncrease={increaseQuantity}
          onDecrease={decreaseQuantity}
          onCheckout={openCheckout}
        />
      ) : null}

      {isCheckoutOpen ? (
        <CheckoutModal
          items={cartItems}
          total={cartTotal}
          itemsCount={cartCount}
          onBack={() => {
            setIsCheckoutOpen(false);
            setIsCartOpen(true);
          }}
          onConfirm={confirmOrder}
        />
      ) : null}

      {selectedProduct ? (
        <ProductConfigurator
          key={selectedProduct.id}
          product={selectedProduct}
          menu={menu}
          onClose={() => setSelectedProduct(null)}
          onAdd={addConfiguredItem}
        />
      ) : null}
    </>
  );
}

function ClientSectionPlaceholder({
  actionLabel,
  onAction,
  title,
}: {
  actionLabel: string;
  onAction: () => void;
  title: string;
}) {
  return (
    <>
      <Header />
      <section className="mt-8 flex min-h-[58vh] items-center">
        <div className="w-full rounded-[32px] border border-[#E8D9C8] bg-[var(--color-card)] px-5 py-8 text-center shadow-[var(--shadow-soft)]">
          <h1 className="text-2xl font-black leading-tight text-[var(--color-text-main)]">
            {title}
          </h1>
          <button
            type="button"
            className="mt-6 h-12 rounded-[24px] bg-[#BD8649] px-6 text-sm font-black text-white shadow-[0_12px_22px_rgba(189,134,73,0.20)] transition duration-300 active:scale-95"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </div>
      </section>
    </>
  );
}

function ClientOrdersList({
  onBackToMenu,
  onOpenOrder,
  orders,
}: {
  onBackToMenu: () => void;
  onOpenOrder: (orderId: string) => void;
  orders: Order[];
}) {
  return (
    <>
      <Header />
      <section className="mt-8">
        <h1 className="text-[30px] font-black leading-tight text-[var(--color-text-main)]">
          Заказы
        </h1>
        <div className="mt-5 space-y-3">
          {orders.map((order) => {
            const itemsCount = order.items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            );

            return (
              <button
                className="w-full rounded-[28px] border border-[#E8D9C8] bg-[var(--color-card)] p-4 text-left shadow-[var(--shadow-soft)] transition duration-300 active:scale-[0.99]"
                key={order.id}
                type="button"
                onClick={() => onOpenOrder(order.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-black text-[var(--color-text-main)]">
                      Заказ #{order.number}
                    </p>
                    <p className="mt-1 text-sm font-bold text-[var(--color-caramel)]">
                      {getClientOrderStatusText(order.status)}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#F2E7D9] px-3 py-1 text-sm font-bold text-[var(--color-text-muted)]">
                    {order.createdAt}
                  </span>
                </div>

                <p className="mt-3 text-sm font-semibold text-[var(--color-text-muted)]">
                  {formatItemsCount(itemsCount)} · {(order.total ?? 0).toLocaleString("ru-RU")} ₽
                </p>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="mt-5 h-12 w-full rounded-[24px] bg-[#BD8649] px-6 text-sm font-black text-white shadow-[0_12px_22px_rgba(189,134,73,0.20)] transition duration-300 active:scale-95"
          onClick={onBackToMenu}
        >
          Перейти в меню
        </button>
      </section>
    </>
  );
}

function SeaSection({ onBackToMenu }: { onBackToMenu: () => void }) {
  return (
    <>
      <Header variant="compact" />
      <section className="mt-8">
        <div className="overflow-hidden rounded-[34px] bg-[#2F4A45] shadow-[0_20px_50px_rgba(64,39,23,0.12)]">
          <div className="relative h-72">
            <img
              src="/client/kafema-sea-atmosphere.jpg"
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(39,54,50,0.08),rgba(39,54,50,0.70))]" />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
              <p className="font-serif text-[2.4rem] font-bold leading-none">
                Мы у моря
              </p>
              <p className="mt-3 max-w-[15rem] text-base font-semibold leading-7 text-white/88">
                Солнце, волны, свежая выпечка и кофе без спешки.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <AtmosphereTile
            image="/client/kafema-sea-hero.jpg"
            label="Кофе на солнце"
            tall
          />
          <AtmosphereTile
            image="/products/croissant.jpg"
            label="Утренняя выпечка"
          />
          <AtmosphereTile
            image="/products/latte.jpg"
            label="Мягкий латте"
          />
          <AtmosphereTile
            image="/client/kafema-sea-atmosphere.jpg"
            label="Берег рядом"
            wide
          />
        </div>

        <button
          type="button"
          className="mt-6 h-[58px] w-full rounded-full bg-[#E30613] px-6 text-base font-black text-white shadow-[0_18px_34px_rgba(227,6,19,0.18)] transition duration-500 active:scale-[0.99]"
          onClick={onBackToMenu}
        >
          Вернуться в меню
        </button>
      </section>
    </>
  );
}

function AtmosphereTile({
  image,
  label,
  tall = false,
  wide = false,
}: {
  image: string;
  label: string;
  tall?: boolean;
  wide?: boolean;
}) {
  return (
    <article
      className={`relative overflow-hidden rounded-[26px] bg-[#EADBC9] shadow-[0_14px_34px_rgba(64,39,23,0.10)] ${
        tall ? "row-span-2 min-h-64" : "min-h-32"
      } ${wide ? "col-span-2 min-h-40" : ""}`}
    >
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(43,29,21,0.02),rgba(43,29,21,0.48))]" />
      <p className="absolute bottom-4 left-4 right-4 font-serif text-xl font-bold leading-tight text-white drop-shadow-[0_2px_8px_rgba(43,29,21,0.4)]">
        {label}
      </p>
    </article>
  );
}

function createCartItemId(productId: string, selection: MenuSelection) {
  const addonPairs = Object.entries(selection.addonOptionIdsByGroupId)
    .map(([groupId, optionIds]) => [groupId, [...optionIds].sort()] as const)
    .sort(([firstGroupId], [secondGroupId]) => firstGroupId.localeCompare(secondGroupId));

  return JSON.stringify({
    productId,
    variantId: selection.variantId ?? "",
    addonPairs,
  });
}

function getCategoryIconSrc(categoryId: string, categoryName: string) {
  const normalizedId = normalizeCategoryKey(categoryId);
  const normalizedName = normalizeCategoryKey(categoryName);
  const key = `${normalizedId} ${normalizedName}`;

  if (key.includes("all") || key.includes("все")) {
    return "/icons/categories/all.svg";
  }

  if (key.includes("coffee") || key.includes("кофе")) {
    return "/icons/categories/coffee.svg";
  }

  if (key.includes("cold") || key.includes("холод")) {
    return "/icons/categories/cold.svg";
  }

  if (key.includes("bakery") || key.includes("выпеч")) {
    return "/icons/categories/bakery.svg";
  }

  if (key.includes("dessert") || key.includes("десерт")) {
    return "/icons/categories/desserts.svg";
  }

  if (key.includes("snack") || key.includes("перекус")) {
    return "/icons/categories/snacks.svg";
  }

  if (key.includes("tea") || key.includes("чай")) {
    return "/icons/categories/tea.svg";
  }

  return "/icons/categories/all.svg";
}

function normalizeCategoryKey(value: string) {
  return value.trim().toLowerCase();
}

function getClientOrderStatusText(status: Order["status"]) {
  if (status === "in_progress") return "Готовится";
  if (status === "ready") return "Заказ готов";
  if (status === "completed") return "Выдан";
  return "Заказ принят";
}

function formatItemsCount(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} позиций`;
  }

  if (lastDigit === 1) {
    return `${count} позиция`;
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} позиции`;
  }

  return `${count} позиций`;
}

function getOrderTime(order: Order) {
  const numericId = Number(order.id.replace(/\D/g, ""));

  if (Number.isFinite(numericId) && numericId > 0) {
    return numericId;
  }

  return 0;
}

function getStoredActiveOrderId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kafema-active-order-id");
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function hasWordStartingWith(value: string, query: string) {
  if (!query) return true;
  return normalizeSearch(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .some((word) => word.startsWith(query));
}
