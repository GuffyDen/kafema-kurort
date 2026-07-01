"use client";

import { useMemo, useState } from "react";
import { BackgroundDecor } from "@/components/BackgroundDecor";
import { BottomNavigation } from "@/components/BottomNavigation";
import { CartBar } from "@/components/CartBar";
import { CartModal } from "@/components/CartModal";
import type { CartItem } from "@/components/CartModal";
import { CategoryCard } from "@/components/CategoryCard";
import { CheckoutModal } from "@/components/CheckoutModal";
import { EmptyState } from "@/components/EmptyState";
import { Header } from "@/components/Header";
import { OrderSuccessModal } from "@/components/OrderSuccessModal";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/components/ProductCard";
import { SearchBar } from "@/components/SearchBar";
import { SectionTitle } from "@/components/SectionTitle";
import {
  getMenuItemWorkstationType,
  isMenuItemOrderable,
  useMenu,
  type ConfiguredMenuItem,
  type MenuSelection,
} from "@/lib/menuStore";
import { createOrder, useOrder } from "@/lib/orderStore";

export function HomeScreen() {
  const menu = useMenu();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(() =>
    getStoredActiveOrderId(),
  );
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [greeting] = useState(() => getVladivostokGreeting());
  const activeOrder = useOrder(activeOrderId);
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
    return activeCategories.map((category) => ({
      id: category.id,
      name: category.name,
      icon: category.icon,
      active: category.id === visibleActiveCategoryId,
    }));
  }, [activeCategories, visibleActiveCategoryId]);

  const products = useMemo(
    () =>
      menu.menuItems.filter((product) => isMenuItemOrderable(menu, product)),
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
        quantity: item.quantity,
      })),
    });

    localStorage.setItem("kafema-active-order-id", order.id);
    setActiveOrderId(order.id);
    setCartItems([]);
    setIsCheckoutOpen(false);
  }

  function returnToMenu() {
    localStorage.removeItem("kafema-active-order-id");
    setActiveOrderId(null);
    setIsCartOpen(false);
    setIsCheckoutOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (activeOrder) {
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
          <Header />

          <section className="mt-8">
            <h1 className="text-[30px] font-black leading-tight text-[var(--color-text-main)]">
              {greeting}
            </h1>
            <p className="mt-2 text-base leading-6 text-[var(--color-text-muted)]">
              Что будем пить сегодня?
            </p>
          </section>

          <div className="mt-6">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>

          <section className="mt-7">
            <div className="flex gap-3 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => (
                <CategoryCard
                  key={category.name}
                  icon={category.icon}
                  name={category.name}
                  active={category.active}
                  onClick={() =>
                    setActiveCategoryId((currentCategoryId) =>
                      currentCategoryId === category.id ? null : category.id,
                    )
                  }
                />
              ))}
            </div>
          </section>

          <section className="mt-7">
            <SectionTitle
              title="Популярное"
              subtitle="Любимые позиции в мягком кофейном настроении"
            />

            <div className="mt-5 grid grid-cols-2 gap-4">
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
        </div>
      </main>

      <CartBar
        itemsCount={cartCount}
        total={cartTotal}
        onOpen={() => setIsCartOpen(true)}
      />
      <BottomNavigation />

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

function getStoredActiveOrderId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kafema-active-order-id");
}

function getVladivostokGreeting(date = new Date()) {
  const hourPart = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: "Asia/Vladivostok",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;
  const hour = Number(hourPart ?? 0);

  if (hour >= 5 && hour < 12) return "Доброе утро! ☀️";
  if (hour >= 12 && hour < 18) return "Добрый день! ☀️";
  if (hour >= 18) return "Добрый вечер! 🌙";
  return "Доброй ночи! 🌙";
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
