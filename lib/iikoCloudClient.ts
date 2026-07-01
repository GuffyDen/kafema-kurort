import {
  iikoReadOnlyRequests,
  type IikoConnectionInput,
  type IikoConnectionResult,
  type IikoOrganization,
  type IikoSyncSummary,
} from "@/lib/iikoReadOnlyProvider";

type IikoClientConfig = {
  apiBaseUrl: string;
  apiLogin: string;
  apiKey: string;
};

type IikoApiOrganization = {
  id?: string;
  name?: string;
};

type IikoApiTerminalGroup = {
  id?: string;
  name?: string;
  organizationId?: string;
};

type IikoApiProduct = {
  id?: string;
  name?: string;
  type?: string;
  modifiers?: unknown[];
  groupModifiers?: unknown[];
};

type IikoApiGroup = {
  id?: string;
  name?: string;
  items?: IikoApiGroup[];
};

type IikoApiNomenclature = {
  products?: IikoApiProduct[];
  groups?: IikoApiGroup[];
  productCategories?: unknown[];
};

type IikoApiStopLists = {
  terminalGroupStopLists?: unknown[];
  stopLists?: unknown[];
};

const defaultBaseUrl = "https://api-ru.iiko.services/api/1";

export function createIikoConfig(input?: Partial<IikoConnectionInput>): IikoClientConfig {
  return {
    apiBaseUrl: trimTrailingSlash(
      process.env.IIKO_API_BASE_URL || defaultBaseUrl,
    ),
    apiLogin: input?.apiLogin?.trim() || process.env.IIKO_API_LOGIN?.trim() || "",
    apiKey: input?.apiKey?.trim() || process.env.IIKO_API_KEY?.trim() || "",
  };
}

export function hasIikoCredentials(config: IikoClientConfig) {
  return Boolean(config.apiLogin && config.apiKey);
}

export async function checkIikoConnectionReal(
  input?: Partial<IikoConnectionInput>,
): Promise<IikoConnectionResult> {
  const config = createIikoConfig(input);

  if (!config.apiLogin) {
    throw new Error("Ожидаю IIKO_API_LOGIN в `.env.local`");
  }

  if (!config.apiKey) {
    throw new Error("Ожидаю API Key в `.env.local`");
  }

  const token = await getAccessToken(config);
  const organizations = await getOrganizations(config, token);

  if (organizations.length === 0) {
    throw new Error("iiko не вернула ни одной организации");
  }

  const selectedOrganization =
    organizations.length === 1 ? organizations[0] : organizations[0];
  const terminalGroups = await getTerminalGroups(config, token, organizations);
  const terminalGroup = terminalGroups.find(
    (group) => group.organizationId === selectedOrganization.id,
  );
  const menu = await getMenu(config, token, selectedOrganization.id);
  const stopLists = await getStopLists(config, token, selectedOrganization.id);
  const summary = createSummary(menu, terminalGroups.length, stopLists);

  return {
    status: "connected",
    mode: "real",
    tokenReceived: Boolean(token),
    menuReceived: Boolean(menu),
    organization: {
      ...selectedOrganization,
      terminalGroupId: terminalGroup?.id,
    },
    organizations: organizations.map((organization) => ({
      ...organization,
      terminalGroupId: terminalGroups.find(
        (group) => group.organizationId === organization.id,
      )?.id,
    })),
    version: "Cloud API",
    lastSyncAt: formatSyncTime(),
    summary,
  };
}

async function getAccessToken(config: IikoClientConfig) {
  const data = await requestAccessToken(config);

  if (!data.token) {
    throw new Error("iiko не вернула access token");
  }

  return data.token;
}

async function requestAccessToken(config: IikoClientConfig) {
  try {
    return await requestIiko<{ token?: string }>(config, "/access_token", {
      apiLogin: config.apiLogin,
      apiKey: config.apiKey,
    });
  } catch (error) {
    if (!isIikoStatusError(error, 401)) {
      throw error;
    }

    return requestIiko<{ token?: string }>(config, "/access_token", {
      apiLogin: config.apiKey,
    });
  }
}

async function getOrganizations(config: IikoClientConfig, token: string) {
  const data = await requestIiko<{ organizations?: IikoApiOrganization[] }>(
    config,
    "/organizations",
    {},
    token,
  );

  return (data.organizations ?? [])
    .filter((organization) => organization.id && organization.name)
    .map<IikoOrganization>((organization) => ({
      id: String(organization.id),
      name: String(organization.name),
    }));
}

async function getTerminalGroups(
  config: IikoClientConfig,
  token: string,
  organizations: IikoOrganization[],
) {
  const data = await requestIiko<{
    terminalGroups?: IikoApiTerminalGroup[];
    organizations?: Array<{ terminalGroups?: IikoApiTerminalGroup[] }>;
  }>(
    config,
    "/terminal_groups",
    { organizationIds: organizations.map((organization) => organization.id) },
    token,
  );

  return [
    ...(data.terminalGroups ?? []),
    ...(data.organizations ?? []).flatMap(
      (organization) => organization.terminalGroups ?? [],
    ),
  ].filter((group) => group.id);
}

async function getMenu(
  config: IikoClientConfig,
  token: string,
  organizationId: string,
) {
  return requestIiko<IikoApiNomenclature>(
    config,
    "/nomenclature",
    { organizationId },
    token,
  );
}

async function getStopLists(
  config: IikoClientConfig,
  token: string,
  organizationId: string,
) {
  try {
    return await requestIiko<IikoApiStopLists>(
      config,
      "/stop_lists",
      { organizationIds: [organizationId] },
      token,
    );
  } catch {
    return null;
  }
}

async function requestIiko<TResponse>(
  config: IikoClientConfig,
  endpoint: string,
  body: Record<string, unknown>,
  token?: string,
) {
  assertEndpointAllowed(endpoint);

  const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new IikoHttpError(response.status, endpoint);
  }

  return (await response.json()) as TResponse;
}

class IikoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(`iiko вернула ошибку ${status} для ${endpoint}`);
  }
}

function isIikoStatusError(error: unknown, status: number) {
  return error instanceof IikoHttpError && error.status === status;
}

function assertEndpointAllowed(endpoint: string) {
  const allowed = iikoReadOnlyRequests.some(
    (request) => request.endpoint === endpoint,
  );

  if (!allowed) {
    throw new Error(`Endpoint ${endpoint} не разрешен в READ ONLY режиме`);
  }
}

function createSummary(
  menu: IikoApiNomenclature,
  terminalGroups: number,
  stopLists: IikoApiStopLists | null,
): IikoSyncSummary {
  const products = menu.products?.length ?? 0;
  const categories =
    menu.productCategories?.length ?? countGroups(menu.groups ?? []);
  const modifiers =
    menu.products?.reduce(
      (sum, product) =>
        sum +
        (product.modifiers?.length ?? 0) +
        (product.groupModifiers?.length ?? 0),
      0,
    ) ?? 0;

  return {
    products,
    categories,
    modifiers,
    terminalGroups,
    stopLists:
      (stopLists?.terminalGroupStopLists?.length ?? 0) +
      (stopLists?.stopLists?.length ?? 0),
  };
}

function countGroups(groups: IikoApiGroup[]): number {
  return groups.reduce(
    (sum, group) => sum + 1 + countGroups(group.items ?? []),
    0,
  );
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function formatSyncTime() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date());
}
