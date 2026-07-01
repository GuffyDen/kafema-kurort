import type { MenuState } from "@/lib/menuStore";

export type IikoConnectionInput = {
  apiLogin: string;
  apiKey: string;
};

export type IikoOrganization = {
  id: string;
  name: string;
  terminalGroupId?: string;
};

export type IikoSyncSummary = {
  products: number;
  categories: number;
  modifiers: number;
  terminalGroups: number;
  stopLists: number;
};

export type IikoConnectionResult = {
  status: "connected";
  mode: "real" | "mock";
  tokenReceived: boolean;
  menuReceived: boolean;
  organization: IikoOrganization;
  organizations: IikoOrganization[];
  version: string;
  lastSyncAt: string;
  summary: IikoSyncSummary;
  lastError?: string;
};

export type IikoReadOnlyRequest = {
  method: "GET" | "POST";
  endpoint: string;
  mode: "auth-only" | "read-only";
  purpose: string;
};

export const iikoReadOnlyRequests: IikoReadOnlyRequest[] = [
  {
    method: "POST",
    endpoint: "/access_token",
    mode: "auth-only",
    purpose: "Получение access token по API Login / API Key.",
  },
  {
    method: "POST",
    endpoint: "/organizations",
    mode: "read-only",
    purpose: "Получение списка организаций, доступных ключу.",
  },
  {
    method: "POST",
    endpoint: "/terminal_groups",
    mode: "read-only",
    purpose: "Получение terminal groups для выбранной организации.",
  },
  {
    method: "POST",
    endpoint: "/nomenclature",
    mode: "read-only",
    purpose: "Получение меню, категорий, товаров, цен и модификаторов.",
  },
  {
    method: "POST",
    endpoint: "/stop_lists",
    mode: "read-only",
    purpose: "Получение стоп-листов, если read-only метод доступен.",
  },
];

export async function checkIikoConnectionMock(
  input: IikoConnectionInput,
  menu: MenuState,
): Promise<IikoConnectionResult> {
  await new Promise((resolve) => window.setTimeout(resolve, 450));

  if (!input.apiLogin.trim() || !input.apiKey.trim()) {
    throw new Error("Укажите API Login и API Key");
  }

  const organizations = input.apiLogin.toLowerCase().includes("multi")
    ? [
        {
          id: "mock-org-kurort",
          name: "Кафема Курорт",
          terminalGroupId: "mock-terminal-bar",
        },
        {
          id: "mock-org-city",
          name: "Кафема Центр",
          terminalGroupId: "mock-terminal-city",
        },
      ]
    : [
        {
          id: "mock-org-kurort",
          name: "Кафема Курорт",
          terminalGroupId: "mock-terminal-bar",
        },
      ];

  return {
    status: "connected",
    mode: "mock",
    tokenReceived: false,
    menuReceived: true,
    organization: organizations[0],
    organizations,
    version: "9.5",
    lastSyncAt: formatSyncTime(),
    summary: createSummary(menu),
  };
}

export function createIikoSyncSummary(menu: MenuState): IikoSyncSummary {
  return createSummary(menu);
}

function createSummary(menu: MenuState): IikoSyncSummary {
  return {
    products: menu.menuItems.length,
    categories: menu.categories.length,
    terminalGroups: menu.workingZones.length,
    modifiers: menu.addonGroups.reduce(
      (sum, group) => sum + 1 + group.options.length,
      0,
    ),
    stopLists:
      menu.menuItems.filter((item) => !item.inStock).length +
      menu.addonGroups.reduce(
        (sum, group) =>
          sum + group.options.filter((option) => !option.isActive).length,
        0,
      ),
  };
}

function formatSyncTime() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date());
}
