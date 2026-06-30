"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";
import {
  addAddonGroup,
  addAddonOption,
  addCategory,
  addMenuItem,
  addVariant,
  addWorkingZone,
  setMenuItemAddonGroup,
  updateAddonGroup,
  updateAddonOption,
  updateCategory,
  updateMenuItem,
  updateVariant,
  updateWorkingZone,
  useMenu,
  type AddonSelectionType,
  type MenuItem,
  type MenuItemKind,
} from "@/lib/menuStore";

type MenuItemDraft = {
  name: string;
  description: string;
  imageSrc: string;
  categoryId: string;
  workingZoneId: string;
  kind: MenuItemKind;
  basePrice: string;
  sortOrder: string;
  isActive: boolean;
  inStock: boolean;
};

type AddonGroupDraft = {
  name: string;
  icon: string;
  required: boolean;
  selectionType: AddonSelectionType;
  sortOrder: string;
  isActive: boolean;
};

type OptionDraft = {
  name: string;
  priceDelta: string;
  sortOrder: string;
  isActive: boolean;
};

type VariantDraft = OptionDraft;

const emptyItemDraft: MenuItemDraft = {
  name: "",
  description: "",
  imageSrc: "",
  categoryId: "",
  workingZoneId: "",
  kind: "drink",
  basePrice: "",
  sortOrder: "100",
  isActive: true,
  inStock: true,
};

const emptyAddonGroupDraft: AddonGroupDraft = {
  name: "",
  icon: "•",
  required: false,
  selectionType: "single",
  sortOrder: "100",
  isActive: true,
};

const emptyOptionDraft: OptionDraft = {
  name: "",
  priceDelta: "0",
  sortOrder: "10",
  isActive: true,
};

export function ManagePanel() {
  const menu = useMenu();
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState("☕");
  const [zoneName, setZoneName] = useState("");
  const [zoneIcon, setZoneIcon] = useState("☕");
  const [itemDraft, setItemDraft] = useState<MenuItemDraft>({
    ...emptyItemDraft,
    categoryId: menu.categories[0]?.id ?? "",
    workingZoneId: menu.workingZones[0]?.id ?? "",
  });
  const [groupDraft, setGroupDraft] = useState<AddonGroupDraft>(emptyAddonGroupDraft);
  const [optionDrafts, setOptionDrafts] = useState<Record<string, OptionDraft>>({});
  const [variantDrafts, setVariantDrafts] = useState<Record<string, VariantDraft>>({});

  function createCategory() {
    addCategory({ name: categoryName, icon: categoryIcon });
    setCategoryName("");
    setCategoryIcon("☕");
  }

  function createZone() {
    addWorkingZone({ name: zoneName, icon: zoneIcon });
    setZoneName("");
    setZoneIcon("☕");
  }

  function createItem() {
    const categoryId = itemDraft.categoryId || menu.categories[0]?.id;
    const workingZoneId = itemDraft.workingZoneId || menu.workingZones[0]?.id;
    if (!categoryId || !workingZoneId) return;

    addMenuItem({
      name: itemDraft.name,
      description: itemDraft.description,
      imageSrc: itemDraft.imageSrc,
      categoryId,
      workingZoneId,
      kind: itemDraft.kind,
      basePrice: Number(itemDraft.basePrice) || 0,
      sortOrder: Number(itemDraft.sortOrder) || 100,
      isActive: itemDraft.isActive,
      inStock: itemDraft.inStock,
    });
    setItemDraft({ ...emptyItemDraft, categoryId, workingZoneId });
  }

  function createAddonGroup() {
    addAddonGroup({
      name: groupDraft.name,
      icon: groupDraft.icon,
      required: groupDraft.required,
      selectionType: groupDraft.selectionType,
      sortOrder: Number(groupDraft.sortOrder) || 100,
      isActive: groupDraft.isActive,
    });
    setGroupDraft(emptyAddonGroupDraft);
  }

  function createAddonOption(groupId: string) {
    const draft = optionDrafts[groupId] ?? emptyOptionDraft;
    addAddonOption(groupId, {
      name: draft.name,
      priceDelta: Number(draft.priceDelta) || 0,
      sortOrder: Number(draft.sortOrder) || 10,
      isActive: draft.isActive,
    });
    setOptionDrafts({ ...optionDrafts, [groupId]: emptyOptionDraft });
  }

  function createVariant(itemId: string) {
    const draft = variantDrafts[itemId] ?? emptyOptionDraft;
    addVariant(itemId, {
      name: draft.name,
      priceDelta: Number(draft.priceDelta) || 0,
      sortOrder: Number(draft.sortOrder) || 10,
      isActive: draft.isActive,
    });
    setVariantDrafts({ ...variantDrafts, [itemId]: emptyOptionDraft });
  }

  return (
    <main className="min-h-screen bg-[#F7F7F7] p-6 text-[#1A1A1A]">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-xl bg-white p-4">
          <h1 className="text-2xl font-bold">Кафема Курорт</h1>
          <p className="text-sm text-[#777777]">
            Минимальный кабинет собственника: модель меню и библиотека дополнений
          </p>
        </header>

        <Panel title="Пункты меню">
          <MenuItemForm
            draft={itemDraft}
            setDraft={setItemDraft}
            categories={menu.categories}
            workingZones={menu.workingZones}
          />
          <button className="mt-3 rounded bg-[#E30613] px-4 py-2 font-bold text-white" onClick={createItem}>
            Создать пункт меню
          </button>

          <div className="mt-5 space-y-4">
            {[...menu.menuItems].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => (
              <MenuItemEditor
                key={item.id}
                item={item}
                categories={menu.categories}
                workingZones={menu.workingZones}
                addonGroups={menu.addonGroups}
                variantDraft={variantDrafts[item.id] ?? emptyOptionDraft}
                setVariantDraft={(draft) => setVariantDrafts({ ...variantDrafts, [item.id]: draft })}
                addVariant={() => createVariant(item.id)}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Категории">
          <div className="grid gap-2 md:grid-cols-[100px_1fr_160px]">
            <Input label="Иконка" value={categoryIcon} onChange={setCategoryIcon} />
            <Input label="Название" value={categoryName} onChange={setCategoryName} />
            <button className="mt-6 rounded bg-[#E30613] px-3 py-2 font-bold text-white" onClick={createCategory}>
              Добавить
            </button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {menu.categories.map((category) => (
              <div className="grid grid-cols-[80px_1fr_120px] gap-2 rounded border border-[#EFEFEF] p-3" key={category.id}>
                <Input label="Иконка" value={category.icon} onChange={(icon) => updateCategory(category.id, { icon })} />
                <Input label="Название" value={category.name} onChange={(name) => updateCategory(category.id, { name })} />
                <Toggle active={category.isActive} trueText="Активна" falseText="Скрыта" onClick={() => updateCategory(category.id, { isActive: !category.isActive })} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Библиотека дополнений">
          <div className="grid gap-2 md:grid-cols-[80px_1fr_150px_120px_120px]">
            <Input label="Иконка" value={groupDraft.icon} onChange={(icon) => setGroupDraft({ ...groupDraft, icon })} />
            <Input label="Группа" value={groupDraft.name} onChange={(name) => setGroupDraft({ ...groupDraft, name })} />
            <Select label="Тип выбора" value={groupDraft.selectionType} onChange={(selectionType) => setGroupDraft({ ...groupDraft, selectionType: selectionType as AddonSelectionType })} options={[{ value: "single", label: "один" }, { value: "multiple", label: "несколько" }]} />
            <Toggle active={groupDraft.required} trueText="Обяз." falseText="Необяз." onClick={() => setGroupDraft({ ...groupDraft, required: !groupDraft.required })} />
            <button className="mt-6 rounded bg-[#E30613] px-3 py-2 font-bold text-white" onClick={createAddonGroup}>
              Добавить
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {[...menu.addonGroups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => {
              const draft = optionDrafts[group.id] ?? emptyOptionDraft;
              return (
                <div className="rounded border border-[#EFEFEF] p-3" key={group.id}>
                  <div className="grid gap-2 md:grid-cols-[70px_1fr_140px_120px_120px]">
                    <Input label="Иконка" value={group.icon} onChange={(icon) => updateAddonGroup(group.id, { icon })} />
                    <Input label="Название" value={group.name} onChange={(name) => updateAddonGroup(group.id, { name })} />
                    <Select label="Тип" value={group.selectionType} onChange={(selectionType) => updateAddonGroup(group.id, { selectionType: selectionType as AddonSelectionType })} options={[{ value: "single", label: "один" }, { value: "multiple", label: "несколько" }]} />
                    <Toggle active={group.required} trueText="Обяз." falseText="Необяз." onClick={() => updateAddonGroup(group.id, { required: !group.required })} />
                    <Toggle active={group.isActive} trueText="Активна" falseText="Скрыта" onClick={() => updateAddonGroup(group.id, { isActive: !group.isActive })} />
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.options.map((option) => (
                      <div className="grid gap-2 md:grid-cols-[1fr_100px_90px_110px]" key={option.id}>
                        <Input label="Вариант" value={option.name} onChange={(name) => updateAddonOption(group.id, option.id, { name })} />
                        <Input label="+ цена" value={String(option.priceDelta)} onChange={(priceDelta) => updateAddonOption(group.id, option.id, { priceDelta: Number(priceDelta) || 0 })} />
                        <Input label="Порядок" value={String(option.sortOrder)} onChange={(sortOrder) => updateAddonOption(group.id, option.id, { sortOrder: Number(sortOrder) || 0 })} />
                        <Toggle active={option.isActive} trueText="Активен" falseText="Скрыт" onClick={() => updateAddonOption(group.id, option.id, { isActive: !option.isActive })} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-[1fr_100px_90px_120px]">
                    <Input label="Новый вариант" value={draft.name} onChange={(name) => setOptionDrafts({ ...optionDrafts, [group.id]: { ...draft, name } })} />
                    <Input label="+ цена" value={draft.priceDelta} onChange={(priceDelta) => setOptionDrafts({ ...optionDrafts, [group.id]: { ...draft, priceDelta } })} />
                    <Input label="Порядок" value={draft.sortOrder} onChange={(sortOrder) => setOptionDrafts({ ...optionDrafts, [group.id]: { ...draft, sortOrder } })} />
                    <button className="mt-6 rounded bg-[#E30613] px-3 py-2 font-bold text-white" onClick={() => createAddonOption(group.id)}>
                      Добавить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Рабочие зоны">
          <div className="grid gap-2 md:grid-cols-[100px_1fr_160px]">
            <Input label="Иконка" value={zoneIcon} onChange={setZoneIcon} />
            <Input label="Название" value={zoneName} onChange={setZoneName} />
            <button className="mt-6 rounded bg-[#E30613] px-3 py-2 font-bold text-white" onClick={createZone}>
              Добавить
            </button>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {menu.workingZones.map((zone) => (
              <div className="grid grid-cols-[80px_1fr_120px] gap-2 rounded border border-[#EFEFEF] p-3" key={zone.id}>
                <Input label="Иконка" value={zone.icon} onChange={(icon) => updateWorkingZone(zone.id, { icon })} />
                <Input label="Название" value={zone.name} onChange={(name) => updateWorkingZone(zone.id, { name })} />
                <Toggle active={zone.isActive} trueText="Активна" falseText="Скрыта" onClick={() => updateWorkingZone(zone.id, { isActive: !zone.isActive })} />
              </div>
            ))}
          </div>
        </Panel>

      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function MenuItemForm({
  draft,
  setDraft,
  categories,
  workingZones,
}: {
  draft: MenuItemDraft;
  setDraft: (draft: MenuItemDraft) => void;
  categories: { id: string; name: string }[];
  workingZones: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      <Input label="Название" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
      <Input label="Описание" value={draft.description} onChange={(description) => setDraft({ ...draft, description })} />
      <Select label="Категория" value={draft.categoryId || categories[0]?.id || ""} onChange={(categoryId) => setDraft({ ...draft, categoryId })} options={categories.map((category) => ({ value: category.id, label: category.name }))} />
      <Select label="Рабочая зона" value={draft.workingZoneId || workingZones[0]?.id || ""} onChange={(workingZoneId) => setDraft({ ...draft, workingZoneId })} options={workingZones.map((zone) => ({ value: zone.id, label: zone.name }))} />
      <Select label="Тип" value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind: kind as MenuItemKind })} options={[{ value: "drink", label: "напиток" }, { value: "food", label: "еда" }, { value: "dessert", label: "десерт" }, { value: "combo", label: "комбо" }, { value: "seasonal", label: "сезонное" }, { value: "certificate", label: "сертификат" }, { value: "other", label: "другое" }]} />
      <Input label="Базовая цена" value={draft.basePrice} onChange={(basePrice) => setDraft({ ...draft, basePrice })} />
      <Input label="Порядок" value={draft.sortOrder} onChange={(sortOrder) => setDraft({ ...draft, sortOrder })} />
      <div className="flex gap-2">
        <Toggle active={draft.isActive} trueText="Активен" falseText="Скрыт" onClick={() => setDraft({ ...draft, isActive: !draft.isActive })} />
        <Toggle active={draft.inStock} trueText="В наличии" falseText="Нет" onClick={() => setDraft({ ...draft, inStock: !draft.inStock })} />
      </div>
      <div className="md:col-span-2 xl:col-span-4">
        <PhotoUpload imageSrc={draft.imageSrc} onChange={(imageSrc) => setDraft({ ...draft, imageSrc })} />
      </div>
    </div>
  );
}

function MenuItemEditor({
  item,
  categories,
  workingZones,
  addonGroups,
  variantDraft,
  setVariantDraft,
  addVariant,
}: {
  item: MenuItem;
  categories: { id: string; name: string }[];
  workingZones: { id: string; name: string }[];
  addonGroups: { id: string; name: string; icon: string; isActive: boolean }[];
  variantDraft: VariantDraft;
  setVariantDraft: (draft: VariantDraft) => void;
  addVariant: () => void;
}) {
  return (
    <article className="rounded border border-[#EFEFEF] p-3">
      <div className="grid gap-2 md:grid-cols-[100px_1fr]">
        <PhotoUpload imageSrc={item.imageSrc} onChange={(imageSrc) => updateMenuItem(item.id, { imageSrc })} />
        <div className="grid gap-2 md:grid-cols-3">
          <Input label="Название" value={item.name} onChange={(name) => updateMenuItem(item.id, { name })} />
          <Input label="Описание" value={item.description} onChange={(description) => updateMenuItem(item.id, { description })} />
          <Input label="Базовая цена" value={String(item.basePrice)} onChange={(basePrice) => updateMenuItem(item.id, { basePrice: Number(basePrice) || 0 })} />
          <Select label="Категория" value={item.categoryId} onChange={(categoryId) => updateMenuItem(item.id, { categoryId })} options={categories.map((category) => ({ value: category.id, label: category.name }))} />
          <Select label="Рабочая зона" value={item.workingZoneId} onChange={(workingZoneId) => updateMenuItem(item.id, { workingZoneId })} options={workingZones.map((zone) => ({ value: zone.id, label: zone.name }))} />
          <Input label="Порядок" value={String(item.sortOrder)} onChange={(sortOrder) => updateMenuItem(item.id, { sortOrder: Number(sortOrder) || 0 })} />
          <Toggle active={item.isActive} trueText="Активен" falseText="Скрыт" onClick={() => updateMenuItem(item.id, { isActive: !item.isActive })} />
          <Toggle active={item.inStock} trueText="В наличии" falseText="Нет" onClick={() => updateMenuItem(item.id, { inStock: !item.inStock })} />
        </div>
      </div>

      <div className="mt-3 grid gap-4 xl:grid-cols-3">
        <div>
          <h3 className="font-bold">Варианты</h3>
          <div className="space-y-2">
            {item.variants.map((variant) => (
              <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2" key={variant.id}>
                <Input label="Название" value={variant.name} onChange={(name) => updateVariant(item.id, variant.id, { name })} />
                <Input label="+ цена" value={String(variant.priceDelta)} onChange={(priceDelta) => updateVariant(item.id, variant.id, { priceDelta: Number(priceDelta) || 0 })} />
                <Input label="Порядок" value={String(variant.sortOrder)} onChange={(sortOrder) => updateVariant(item.id, variant.id, { sortOrder: Number(sortOrder) || 0 })} />
                <Toggle active={variant.isActive} trueText="Активен" falseText="Скрыт" onClick={() => updateVariant(item.id, variant.id, { isActive: !variant.isActive })} />
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_90px_90px_100px] gap-2">
            <Input label="Новый вариант" value={variantDraft.name} onChange={(name) => setVariantDraft({ ...variantDraft, name })} />
            <Input label="+ цена" value={variantDraft.priceDelta} onChange={(priceDelta) => setVariantDraft({ ...variantDraft, priceDelta })} />
            <Input label="Порядок" value={variantDraft.sortOrder} onChange={(sortOrder) => setVariantDraft({ ...variantDraft, sortOrder })} />
            <button className="mt-6 rounded bg-[#E30613] px-2 py-1 font-bold text-white" onClick={addVariant}>Добавить</button>
          </div>
        </div>
        <div className="xl:col-span-2">
          <h3 className="font-bold">Подключенные группы дополнений</h3>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {addonGroups.filter((group) => group.isActive).map((group) => (
              <label className="flex items-center gap-2 rounded border border-[#EFEFEF] p-2" key={group.id}>
                <input
                  type="checkbox"
                  checked={item.addonGroupIds.includes(group.id)}
                  onChange={(event) => setMenuItemAddonGroup(item.id, group.id, event.target.checked)}
                />
                <span>{group.icon}</span>
                <span className="font-semibold">{group.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#777777]">{label}</span>
      <input className="mt-1 h-10 w-full rounded border border-[#EFEFEF] px-2" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-[#777777]">{label}</span>
      <select className="mt-1 h-10 w-full rounded border border-[#EFEFEF] bg-white px-2" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ active, trueText, falseText, onClick }: { active: boolean; trueText: string; falseText: string; onClick: () => void }) {
  return (
    <button type="button" className={`mt-6 h-10 rounded px-3 text-sm font-bold ${active ? "bg-[#E30613] text-white" : "bg-[#F7F7F7] text-[#777777]"}`} onClick={onClick}>
      {active ? trueText : falseText}
    </button>
  );
}

function PhotoUpload({ imageSrc, onChange }: { imageSrc: string; onChange: (imageSrc: string) => void }) {
  const [error, setError] = useState("");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      onChange(await prepareProductImage(file));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось загрузить фото");
    }
  }

  return (
    <div>
      <span className="text-xs font-bold text-[#777777]">Фото</span>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-16 w-16 overflow-hidden rounded bg-[#F7F7F7]">
          {imageSrc ? <img src={imageSrc} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <label className="cursor-pointer rounded bg-[#E30613] px-3 py-2 text-sm font-bold text-white">
          Загрузить
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} />
        </label>
      </div>
      {error ? <p className="mt-1 text-xs font-semibold text-[#E30613]">{error}</p> : null}
    </div>
  );
}

const supportedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxOriginalPhotoBytes = 12 * 1024 * 1024;
const maxStoredPhotoBytes = 2.8 * 1024 * 1024;
const maxPhotoWidth = 1200;

// MVP: local data URL in localStorage. Later replace this with Supabase Storage upload.
async function prepareProductImage(file: File) {
  if (!supportedPhotoTypes.has(file.type)) throw new Error("Выберите изображение JPG, PNG или WEBP");
  if (file.size > maxOriginalPhotoBytes) throw new Error("Фото слишком большое. Выберите файл до 12 МБ");
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
  const blob = (await canvasToBlob(canvas, "image/webp", 0.82)) ?? (await canvasToBlob(canvas, "image/jpeg", 0.84));
  if (!blob) throw new Error("Не удалось сохранить фото");
  if (blob.size > maxStoredPhotoBytes) throw new Error("Фото слишком большое после сжатия. Выберите другое изображение");
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
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось сохранить фото"));
    reader.readAsDataURL(blob);
  });
}
