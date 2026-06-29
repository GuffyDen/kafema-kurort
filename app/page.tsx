import { HomeScreen } from "@/components/HomeScreen";
import type { Product } from "@/components/ProductCard";

const categories = [
  { name: "Кофе", icon: "☕", active: true },
  { name: "Выпечка", icon: "🥐" },
  { name: "Перекусы", icon: "🥪" },
  { name: "Десерты", icon: "🍰" },
  { name: "Напитки", icon: "🥤" },
];

const products: Product[] = [
  {
    id: "cappuccino",
    name: "Капучино",
    volume: "300 мл",
    price: 230,
    image:
      "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=640&q=85",
  },
  {
    id: "latte",
    name: "Латте",
    volume: "350 мл",
    price: 250,
    image:
      "https://images.unsplash.com/photo-1561882468-9110e03e0f78?auto=format&fit=crop&w=640&q=85",
  },
  {
    id: "americano",
    name: "Американо",
    volume: "250 мл",
    price: 190,
    image:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=640&q=85",
  },
  {
    id: "raf",
    name: "Раф",
    volume: "300 мл",
    price: 280,
    image:
      "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=640&q=85",
  },
  {
    id: "flat-white",
    name: "Флэт уайт",
    volume: "250 мл",
    price: 260,
    image:
      "https://images.unsplash.com/photo-1485808191679-5f86510681a2?auto=format&fit=crop&w=640&q=85",
  },
  {
    id: "cocoa",
    name: "Какао",
    volume: "300 мл",
    price: 240,
    image:
      "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=640&q=85",
  },
  {
    id: "croissant",
    name: "Круассан",
    volume: "90 г",
    price: 210,
    image:
      "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=640&q=85",
  },
  {
    id: "cheesecake",
    name: "Чизкейк",
    volume: "120 г",
    price: 290,
    image:
      "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=640&q=85",
  },
];

export default function Home() {
  return (
    <HomeScreen
      categories={categories}
      products={products}
      hasRepeatOrder={true}
    />
  );
}
