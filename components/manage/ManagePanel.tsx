"use client";

import type { ReactNode } from "react";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import {
  addCategory,
  addProduct,
  updateCategory,
  updateProduct,
  useMenu,
  type BaristaProductType,
  type MenuCategory,
  type MenuProduct,
} from "@/lib/menuStore";

type ProductDraft = {
  name: string;
  categoryId: string;
  price: string;
  volume: string;
  imageSrc: string;
  baristaType: BaristaProductType;
  isActive: boolean;
  inStock: boolean;
};

const emptyProductDraft: ProductDraft = {
  name: "",
  categoryId: "",
  price: "",
  volume: "",
  imageSrc: "",
  baristaType: "drink",
  isActive: true,
  inStock: true,
};

export function ManagePanel() {
  const menu = useMenu();
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("☕");
  const [productDraft, setProductDraft] = useState<ProductDraft>({
    ...emptyProductDraft,
    categoryId: menu.categories[0]?.id ?? "",
  });

  const categoryNameById = useMemo(
    () =>
      menu.categories.reduce<Record<string, string>>((acc, category) => {
        acc[category.id] = category.name;
        return acc;
      }, {}),
    [menu.categories],
  );

  function handleAddCategory() {
    addCategory({ name: categoryName, icon: categoryIcon });
    setCategoryName("");
    setCategoryIcon("☕");
  }

  function handleAddProduct() {
    const categoryId = productDraft.categoryId || menu.categories[0]?.id;

    if (!categoryId) {
      return;
    }

    addProduct({
      ...productDraft,
      categoryId,
      price: Number(productDraft.price) || 0,
    });

    setProductDraft({
      ...emptyProductDraft,
      categoryId,
    });
  }

  return (
    <main className="min-h-screen bg-[#F7F7F7] px-6 py-6 text-[#1A1A1A] lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-7">
        <header className="flex flex-col gap-4 rounded-[32px] bg-white px-6 py-6 shadow-[0_18px_44px_rgba(26,26,26,0.06)] md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-4xl font-bold leading-none text-[#E30613]">
              Кафема Курорт
            </p>
            <h1 className="mt-3 text-2xl font-bold">Кабинет собственника</h1>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-bold text-[#777777]">
            <a className="rounded-full bg-[#F7F7F7] px-4 py-2" href="#menu">
              Меню
            </a>
            <a
              className="rounded-full bg-[#F7F7F7] px-4 py-2"
              href="#categories"
            >
              Категории
            </a>
            <a
              className="rounded-full bg-[#F7F7F7] px-4 py-2"
              href="#stop-list"
            >
              Стоп-лист
            </a>
          </nav>
        </header>

        <section id="categories" className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <Panel title="Категории" subtitle="Скрытые категории не видны гостям.">
            <div className="grid grid-cols-[88px_1fr] gap-3">
              <Field label="Иконка">
                <input
                  className="h-12 w-full rounded-[16px] border border-[#EFEFEF] bg-white px-3 text-base outline-none focus:border-[#E30613]"
                  value={categoryIcon}
                  onChange={(event) => setCategoryIcon(event.target.value)}
                />
              </Field>
              <Field label="Название">
                <input
                  className="h-12 w-full rounded-[16px] border border-[#EFEFEF] bg-white px-3 text-base outline-none focus:border-[#E30613]"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Например: Завтраки"
                />
              </Field>
            </div>
            <button
              type="button"
              className="mt-4 h-12 w-full rounded-[18px] bg-[#E30613] text-base font-bold text-white"
              onClick={handleAddCategory}
            >
              Добавить категорию
            </button>
          </Panel>

          <Panel title="Список категорий" subtitle="Редактирование без удаления.">
            <div className="grid gap-3 md:grid-cols-2">
              {menu.categories.map((category) => (
                <CategoryRow key={category.id} category={category} />
              ))}
            </div>
          </Panel>
        </section>

        <section id="menu" className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <Panel title="Добавить товар" subtitle="Новый товар сразу попадает в меню.">
            <ProductForm
              draft={productDraft}
              categories={menu.categories}
              onChange={setProductDraft}
              onSubmit={handleAddProduct}
            />
          </Panel>

          <Panel title="Меню" subtitle="Товары можно скрывать и выключать из продажи.">
            <div className="grid gap-4 lg:grid-cols-2">
              {menu.products.map((product) => (
                <ProductEditor
                  key={product.id}
                  product={product}
                  categories={menu.categories}
                  categoryName={categoryNameById[product.categoryId] ?? "Без категории"}
                />
              ))}
            </div>
          </Panel>
        </section>

        <section id="stop-list">
          <Panel
            title="Стоп-лист"
            subtitle="Быстро выключайте закончившиеся позиции."
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {menu.products
                .filter((product) => product.isActive)
                .map((product) => (
                  <StopListItem key={product.id} product={product} />
                ))}
            </div>
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-[0_18px_44px_rgba(26,26,26,0.06)]">
      <div className="mb-5">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="mt-1 text-sm font-medium text-[#777777]">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#777777]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function CategoryRow({ category }: { category: MenuCategory }) {
  return (
    <article className="rounded-[22px] border border-[#EFEFEF] p-4">
      <div className="grid grid-cols-[64px_1fr] gap-3">
        <Field label="Иконка">
          <input
            className="h-11 w-full rounded-[14px] border border-[#EFEFEF] px-3 outline-none focus:border-[#E30613]"
            value={category.icon}
            onChange={(event) =>
              updateCategory(category.id, { icon: event.target.value })
            }
          />
        </Field>
        <Field label="Название">
          <input
            className="h-11 w-full rounded-[14px] border border-[#EFEFEF] px-3 outline-none focus:border-[#E30613]"
            value={category.name}
            onChange={(event) =>
              updateCategory(category.id, { name: event.target.value })
            }
          />
        </Field>
      </div>
      <ToggleButton
        active={category.isActive}
        activeLabel="Показана"
        inactiveLabel="Скрыта"
        onClick={() =>
          updateCategory(category.id, { isActive: !category.isActive })
        }
      />
    </article>
  );
}

function ProductForm({
  draft,
  categories,
  onChange,
  onSubmit,
}: {
  draft: ProductDraft;
  categories: MenuCategory[];
  onChange: (draft: ProductDraft) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      <Field label="Название">
        <input
          className="h-12 w-full rounded-[16px] border border-[#EFEFEF] px-3 outline-none focus:border-[#E30613]"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          placeholder="Например: Матча латте"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Категория">
          <select
            className="h-12 w-full rounded-[16px] border border-[#EFEFEF] bg-white px-3 outline-none focus:border-[#E30613]"
            value={draft.categoryId || categories[0]?.id}
            onChange={(event) =>
              onChange({ ...draft, categoryId: event.target.value })
            }
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Тип для бариста">
          <select
            className="h-12 w-full rounded-[16px] border border-[#EFEFEF] bg-white px-3 outline-none focus:border-[#E30613]"
            value={draft.baristaType}
            onChange={(event) =>
              onChange({
                ...draft,
                baristaType: event.target.value as BaristaProductType,
              })
            }
          >
            <option value="drink">drink</option>
            <option value="food">food</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Цена">
          <input
            className="h-12 w-full rounded-[16px] border border-[#EFEFEF] px-3 outline-none focus:border-[#E30613]"
            value={draft.price}
            inputMode="numeric"
            onChange={(event) =>
              onChange({ ...draft, price: event.target.value })
            }
            placeholder="250"
          />
        </Field>
        <Field label="Объем / описание">
          <input
            className="h-12 w-full rounded-[16px] border border-[#EFEFEF] px-3 outline-none focus:border-[#E30613]"
            value={draft.volume}
            onChange={(event) =>
              onChange({ ...draft, volume: event.target.value })
            }
            placeholder="300 мл"
          />
        </Field>
      </div>
      <PhotoUpload
        imageSrc={draft.imageSrc}
        onChange={(imageSrc) => onChange({ ...draft, imageSrc })}
      />
      <div className="grid grid-cols-2 gap-3">
        <ToggleButton
          active={draft.isActive}
          activeLabel="Активен"
          inactiveLabel="Скрыт"
          onClick={() => onChange({ ...draft, isActive: !draft.isActive })}
        />
        <ToggleButton
          active={draft.inStock}
          activeLabel="В наличии"
          inactiveLabel="Нет в наличии"
          onClick={() => onChange({ ...draft, inStock: !draft.inStock })}
        />
      </div>
      <button
        type="button"
        className="h-12 w-full rounded-[18px] bg-[#E30613] text-base font-bold text-white"
        onClick={onSubmit}
      >
        Добавить товар
      </button>
    </div>
  );
}

function ProductEditor({
  product,
  categories,
  categoryName,
}: {
  product: MenuProduct;
  categories: MenuCategory[];
  categoryName: string;
}) {
  return (
    <article className="rounded-[24px] border border-[#EFEFEF] p-4">
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[18px] bg-[#F7F7F7]">
          <img
            src={product.imageSrc}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <input
            className="h-10 w-full rounded-[14px] border border-[#EFEFEF] px-3 text-base font-bold outline-none focus:border-[#E30613]"
            value={product.name}
            onChange={(event) =>
              updateProduct(product.id, { name: event.target.value })
            }
          />
          <p className="mt-2 text-sm font-semibold text-[#777777]">
            {categoryName}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Категория">
          <select
            className="h-11 w-full rounded-[14px] border border-[#EFEFEF] bg-white px-3 outline-none focus:border-[#E30613]"
            value={product.categoryId}
            onChange={(event) =>
              updateProduct(product.id, { categoryId: event.target.value })
            }
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Тип">
          <select
            className="h-11 w-full rounded-[14px] border border-[#EFEFEF] bg-white px-3 outline-none focus:border-[#E30613]"
            value={product.baristaType}
            onChange={(event) =>
              updateProduct(product.id, {
                baristaType: event.target.value as BaristaProductType,
              })
            }
          >
            <option value="drink">drink</option>
            <option value="food">food</option>
          </select>
        </Field>
        <Field label="Цена">
          <input
            className="h-11 w-full rounded-[14px] border border-[#EFEFEF] px-3 outline-none focus:border-[#E30613]"
            value={product.price}
            inputMode="numeric"
            onChange={(event) =>
              updateProduct(product.id, { price: Number(event.target.value) })
            }
          />
        </Field>
        <Field label="Объем / описание">
          <input
            className="h-11 w-full rounded-[14px] border border-[#EFEFEF] px-3 outline-none focus:border-[#E30613]"
            value={product.volume}
            onChange={(event) =>
              updateProduct(product.id, { volume: event.target.value })
            }
          />
        </Field>
      </div>
      <div className="mt-4">
        <PhotoUpload
          imageSrc={product.imageSrc}
          onChange={(imageSrc) => updateProduct(product.id, { imageSrc })}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <ToggleButton
          active={product.isActive}
          activeLabel="Активен"
          inactiveLabel="Скрыт"
          onClick={() =>
            updateProduct(product.id, { isActive: !product.isActive })
          }
        />
        <ToggleButton
          active={product.inStock}
          activeLabel="В наличии"
          inactiveLabel="Нет в наличии"
          onClick={() =>
            updateProduct(product.id, { inStock: !product.inStock })
          }
        />
      </div>
    </article>
  );
}

function StopListItem({ product }: { product: MenuProduct }) {
  return (
    <article className="flex items-center justify-between gap-4 rounded-[22px] border border-[#EFEFEF] p-4">
      <div className="min-w-0">
        <p className="truncate text-base font-bold">{product.name}</p>
        <p className="mt-1 text-sm font-semibold text-[#777777]">
          {product.volume}
        </p>
      </div>
      <ToggleButton
        active={product.inStock}
        activeLabel="В наличии"
        inactiveLabel="Нет в наличии"
        onClick={() => updateProduct(product.id, { inStock: !product.inStock })}
      />
    </article>
  );
}

function PhotoUpload({
  imageSrc,
  onChange,
}: {
  imageSrc: string;
  onChange: (imageSrc: string) => void;
}) {
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setError("");
    setIsProcessing(true);

    try {
      const imageDataUrl = await prepareProductImage(file);
      onChange(imageDataUrl);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить фото. Попробуйте другой файл.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div>
      <span className="text-xs font-bold text-[#777777]">Фото товара</span>
      <div className="mt-2 flex items-center gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[18px] bg-[#F7F7F7]">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#777777]">
              Нет фото
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-[16px] bg-[#E30613] px-4 text-sm font-bold text-white">
            {isProcessing ? "Обработка..." : "Загрузить фото"}
            <input
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-[#777777]">
            JPG, PNG или WEBP. Фото временно хранится локально в приложении.
          </p>
          {error ? (
            <p className="mt-2 text-xs font-semibold text-[#E30613]">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  activeLabel,
  inactiveLabel,
  onClick,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`h-11 rounded-[16px] px-4 text-sm font-bold ${
        active
          ? "bg-[#E30613] text-white"
          : "bg-[#F7F7F7] text-[#777777]"
      }`}
      onClick={onClick}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

const supportedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxOriginalPhotoBytes = 12 * 1024 * 1024;
const maxStoredPhotoBytes = 2.8 * 1024 * 1024;
const maxPhotoWidth = 1200;

// MVP temporary implementation: store a resized data URL in localStorage.
// Later this function should upload the file to Supabase Storage and return a public URL.
async function prepareProductImage(file: File) {
  if (!supportedPhotoTypes.has(file.type)) {
    throw new Error("Выберите изображение JPG, PNG или WEBP");
  }

  if (file.size > maxOriginalPhotoBytes) {
    throw new Error("Фото слишком большое. Выберите файл до 12 МБ");
  }

  const image = await loadImage(file);
  const scale = Math.min(1, maxPhotoWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    URL.revokeObjectURL(image.src);
    throw new Error("Не удалось обработать фото");
  }

  context.drawImage(image, 0, 0, width, height);
  URL.revokeObjectURL(image.src);

  const blob =
    (await canvasToBlob(canvas, "image/webp", 0.82)) ??
    (await canvasToBlob(canvas, "image/jpeg", 0.84));

  if (!blob) {
    throw new Error("Не удалось сохранить фото");
  }

  if (blob.size > maxStoredPhotoBytes) {
    throw new Error("Фото слишком большое после сжатия. Выберите другое изображение");
  }

  return blobToDataUrl(blob);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не удалось прочитать изображение"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось сохранить фото"));
    reader.readAsDataURL(blob);
  });
}
