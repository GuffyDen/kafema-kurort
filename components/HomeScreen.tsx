"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomNavigation } from "@/components/BottomNavigation";
import { CartBar } from "@/components/CartBar";
import { CartModal } from "@/components/CartModal";
import type { CartItem } from "@/components/CartModal";
import { CategoryCard } from "@/components/CategoryCard";
import { CheckoutModal } from "@/components/CheckoutModal";
import { EmptyState } from "@/components/EmptyState";
import { Header } from "@/components/Header";
import { OrderSuccessModal } from "@/components/OrderSuccessModal";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/components/ProductCard";
import { RepeatOrderCard } from "@/components/RepeatOrderCard";
import { SearchBar } from "@/components/SearchBar";
import { SectionTitle } from "@/components/SectionTitle";
import {
  getMenuItemPrice,
  getMenuItemSummary,
  getMenuItemWorkstationType,
  useMenu,
} from "@/lib/menuStore";
import { createOrder, useOrder } from "@/lib/orderStore";

type HomeScreenProps = {
  hasRepeatOrder: boolean;
};

export function HomeScreen({ hasRepeatOrder }: HomeScreenProps) {
  const menu = useMenu();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const activeOrder = useOrder(activeOrderId);
  const categories = useMemo(() => {
    const activeCategories = menu.categories.filter(
      (category) => category.isActive,
    );

    return activeCategories.map((category, index) => ({
      name: category.name,
      icon: category.icon,
      active: index === 0,
    }));
  }, [menu.categories]);

  const products = useMemo(
    () =>
      menu.menuItems.filter((product) => {
        const category = menu.categories.find(
          (currentCategory) => currentCategory.id === product.categoryId,
        );

        return product.isActive && product.inStock && category?.isActive;
      }),
    [menu.categories, menu.menuItems],
  );

  useEffect(() => {
    const savedOrderId = localStorage.getItem("kafema-active-order-id");

    if (savedOrderId) {
      setActiveOrderId(savedOrderId);
    }
  }, []);

  const cartCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  const cartTotal = useMemo(
    () =>
      cartItems.reduce(
        (sum, item) => sum + getMenuItemPrice(item.product) * item.quantity,
        0,
      ),
    [cartItems],
  );

  function addToCart(product: Product) {
    if (!product.inStock) {
      return;
    }

    setCartItems((items) => {
      const existingItem = items.find((item) => item.product.id === product.id);

      if (existingItem) {
        return items.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [...items, { product, quantity: 1 }];
    });
  }

  function increaseQuantity(productId: string) {
    setCartItems((items) =>
      items.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      ),
    );
  }

  function decreaseQuantity(productId: string) {
    setCartItems((items) =>
      items
        .map((item) =>
          item.product.id === productId
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
        volume: getMenuItemSummary(item.product),
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

  return (
    <>
      <main className="min-h-screen overflow-x-hidden bg-[#F7F7F7] text-[#1A1A1A]">
        <div className="mx-auto min-h-screen w-full max-w-md px-4 pb-44 pt-5">
          <Header />

          <section className="mt-8">
            <h1 className="text-[28px] font-bold leading-tight text-[#1A1A1A]">
              Доброе утро, Денис! ☀️
            </h1>
            <p className="mt-2 text-base leading-6 text-[#777777]">
              Что будем пить сегодня?
            </p>
          </section>

          <div className="mt-6">
            <SearchBar />
          </div>

          <section className="mt-6">
            {hasRepeatOrder ? (
              <RepeatOrderCard />
            ) : (
              <EmptyState text="Ваш любимый заказ появится здесь после первого предзаказа." />
            )}
          </section>

          <section className="mt-8">
            <div className="flex gap-3 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((category) => (
                <CategoryCard
                  key={category.name}
                  icon={category.icon}
                  name={category.name}
                  active={category.active}
                />
              ))}
            </div>
          </section>

          <section className="mt-7">
            <SectionTitle
              title="Популярное"
              subtitle="Большие карточки, любимые напитки и свежие десерты"
            />

            <div className="mt-5 grid grid-cols-2 gap-4">
              {products.length > 0 ? (
                products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAdd={addToCart}
                  />
                ))
              ) : (
                <div className="col-span-2">
                  <EmptyState text="Пока в меню нет доступных товаров." />
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

      {activeOrder ? (
        <OrderSuccessModal
          order={activeOrder}
          onBackToMenu={returnToMenu}
        />
      ) : null}
    </>
  );
}
