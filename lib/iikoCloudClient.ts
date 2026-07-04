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
  terminalGroupId: string;
};

export type IikoEndpointCheck = {
  method: "POST";
  endpoint: string;
  mode: "auth-only" | "read-only";
  status: number | null;
  ok: boolean;
  response: unknown;
  error?: string;
};

export type IikoReadOnlyCheckResult = {
  ok: boolean;
  tokenReceived: boolean;
  organizationsCount: number;
  selectedOrganizationId: string | null;
  selectedOrganizationName: string | null;
  terminalGroupId: string | null;
  terminalGroupFound: boolean;
  menuReceived: boolean;
  counts: IikoSyncSummary;
  endpoints: IikoEndpointCheck[];
  errors: Array<{
    step: string;
    endpoint?: string;
    status?: number;
    message: string;
    response?: unknown;
  }>;
  result?: IikoConnectionResult;
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
    terminalGroupId: process.env.IIKO_TERMINAL_GROUP_ID?.trim() || "",
  };
}

export function hasIikoCredentials(config: IikoClientConfig) {
  return Boolean(config.apiLogin && config.apiKey);
}

export async function checkIikoConnectionReal(
  input?: Partial<IikoConnectionInput>,
): Promise<IikoConnectionResult> {
  const check = await checkIikoConnectionReadOnly(input);

  if (!check.ok || !check.result) {
    throw new Error(
      check.errors[0]?.message ?? "Не удалось подключиться к iiko",
    );
  }

  return check.result;
}

export async function checkIikoConnectionReadOnly(
  input?: Partial<IikoConnectionInput>,
): Promise<IikoReadOnlyCheckResult> {
  const config = createIikoConfig(input);
  const endpoints: IikoEndpointCheck[] = [];
  const errors: IikoReadOnlyCheckResult["errors"] = [];
  const emptyCounts = createSummary(null, 0, null);

  if (!config.apiKey) {
    return {
      ok: false,
      tokenReceived: false,
      organizationsCount: 0,
      selectedOrganizationId: null,
      selectedOrganizationName: null,
      terminalGroupId: config.terminalGroupId || null,
      terminalGroupFound: false,
      menuReceived: false,
      counts: emptyCounts,
      endpoints,
      errors: [
        {
          step: "credentials",
          message: "Ожидаю IIKO_API_KEY в серверных переменных окружения",
        },
      ],
    };
  }

  try {
    const token = await getAccessToken(config, endpoints);
    const organizations = await getOrganizations(config, token, endpoints);

    if (organizations.length === 0) {
      throw new Error("iiko не вернула ни одной организации");
    }

    const selectedOrganization =
      organizations.length === 1 ? organizations[0] : organizations[0];
    const terminalGroups = await getTerminalGroups(
      config,
      token,
      organizations,
      endpoints,
    );
    const configuredTerminalGroup = config.terminalGroupId
      ? terminalGroups.find((group) => group.id === config.terminalGroupId)
      : null;
    const organizationTerminalGroup = terminalGroups.find(
      (group) => group.organizationId === selectedOrganization.id,
    );
    const terminalGroup = configuredTerminalGroup ?? organizationTerminalGroup;
    const menu = await getMenu(config, token, selectedOrganization.id, endpoints);
    const summary = createSummary(menu, terminalGroups.length, null);
    const result: IikoConnectionResult = {
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
      version: "Cloud API v1",
      lastSyncAt: formatSyncTime(),
      summary,
    };

    return {
      ok: true,
      tokenReceived: true,
      organizationsCount: organizations.length,
      selectedOrganizationId: selectedOrganization.id,
      selectedOrganizationName: selectedOrganization.name,
      terminalGroupId: config.terminalGroupId || terminalGroup?.id || null,
      terminalGroupFound: config.terminalGroupId
        ? Boolean(configuredTerminalGroup)
        : Boolean(terminalGroup),
      menuReceived: true,
      counts: summary,
      endpoints,
      errors,
      result,
    };
  } catch (error) {
    errors.push(createCheckError(error));

    return {
      ok: false,
      tokenReceived: endpoints.some(
        (endpoint) => endpoint.endpoint === "/access_token" && endpoint.ok,
      ),
      organizationsCount: 0,
      selectedOrganizationId: null,
      selectedOrganizationName: null,
      terminalGroupId: config.terminalGroupId || null,
      terminalGroupFound: false,
      menuReceived: false,
      counts: emptyCounts,
      endpoints,
      errors,
    };
  }
}

async function getAccessToken(
  config: IikoClientConfig,
  endpoints?: IikoEndpointCheck[],
) {
  const data = await requestAccessToken(config, endpoints);

  if (!data.token) {
    throw new Error("iiko не вернула access token");
  }

  return data.token;
}

async function requestAccessToken(
  config: IikoClientConfig,
  endpoints?: IikoEndpointCheck[],
) {
  return requestIiko<{ token?: string }>(config, "/access_token", {
    apiLogin: config.apiKey,
  }, undefined, endpoints);
}

async function getOrganizations(
  config: IikoClientConfig,
  token: string,
  endpoints?: IikoEndpointCheck[],
) {
  const data = await requestIiko<{ organizations?: IikoApiOrganization[] }>(
    config,
    "/organizations",
    {},
    token,
    endpoints,
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
  endpoints?: IikoEndpointCheck[],
) {
  const data = await requestIiko<{
    terminalGroups?: IikoApiTerminalGroup[];
    organizations?: Array<{ terminalGroups?: IikoApiTerminalGroup[] }>;
  }>(
    config,
    "/terminal_groups",
    { organizationIds: organizations.map((organization) => organization.id) },
    token,
    endpoints,
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
  endpoints?: IikoEndpointCheck[],
) {
  return requestIiko<IikoApiNomenclature>(
    config,
    "/nomenclature",
    { organizationId },
    token,
    endpoints,
  );
}

async function requestIiko<TResponse>(
  config: IikoClientConfig,
  endpoint: string,
  body: Record<string, unknown>,
  token?: string,
  endpoints?: IikoEndpointCheck[],
) {
  assertEndpointAllowed(endpoint);
  const metadata = iikoReadOnlyRequests.find(
    (request) => request.endpoint === endpoint,
  );

  const response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const rawBody = await response.text();
  const parsedBody = parseJson(rawBody);
  const responseSummary = summarizeIikoResponse(endpoint, parsedBody ?? rawBody);

  endpoints?.push({
    method: "POST",
    endpoint,
    mode: metadata?.mode ?? "read-only",
    status: response.status,
    ok: response.ok,
    response: responseSummary,
    ...(response.ok ? {} : { error: getIikoErrorMessage(parsedBody, rawBody) }),
  });

  if (!response.ok) {
    throw new IikoHttpError(
      response.status,
      endpoint,
      getIikoErrorMessage(parsedBody, rawBody),
      responseSummary,
    );
  }

  return (parsedBody ?? {}) as TResponse;
}

class IikoHttpError extends Error {
  constructor(
    readonly status: number,
    readonly endpoint: string,
    message: string,
    readonly response: unknown,
  ) {
    super(message || `iiko вернула ошибку ${status} для ${endpoint}`);
  }
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
  menu: IikoApiNomenclature | null,
  terminalGroups: number,
  stopLists: IikoApiStopLists | null,
): IikoSyncSummary {
  const products = menu?.products?.length ?? 0;
  const categories =
    menu?.productCategories?.length ?? countGroups(menu?.groups ?? []);
  const modifiers =
    menu?.products?.reduce(
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

function createCheckError(error: unknown) {
  if (error instanceof IikoHttpError) {
    return {
      step: error.endpoint,
      endpoint: error.endpoint,
      status: error.status,
      message: error.message,
      response: error.response,
    };
  }

  return {
    step: "check",
    message:
      error instanceof Error ? error.message : "Не удалось проверить iiko",
  };
}

function parseJson(value: string) {
  if (!value) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function getIikoErrorMessage(parsedBody: unknown, rawBody: string) {
  if (isRecord(parsedBody)) {
    const message =
      parsedBody.errorDescription ??
      parsedBody.message ??
      parsedBody.error ??
      parsedBody.title;

    if (typeof message === "string") {
      return message;
    }
  }

  return rawBody || "iiko вернула ошибку";
}

function summarizeIikoResponse(endpoint: string, body: unknown) {
  if (!isRecord(body)) {
    return typeof body === "string" ? body.slice(0, 500) : body;
  }

  if (endpoint === "/access_token") {
    return {
      token: typeof body.token === "string" ? "[received]" : null,
      correlationId: body.correlationId ?? null,
    };
  }

  if (endpoint === "/organizations") {
    const organizations = Array.isArray(body.organizations)
      ? body.organizations
      : [];

    return {
      correlationId: body.correlationId ?? null,
      organizationsCount: organizations.length,
      organizations: organizations.map((organization) =>
        isRecord(organization)
          ? { id: organization.id ?? null, name: organization.name ?? null }
          : organization,
      ),
    };
  }

  if (endpoint === "/terminal_groups") {
    const terminalGroups = Array.isArray(body.terminalGroups)
      ? body.terminalGroups
      : [];
    const nestedTerminalGroups = Array.isArray(body.organizations)
      ? body.organizations.flatMap((organization) =>
          isRecord(organization) && Array.isArray(organization.terminalGroups)
            ? organization.terminalGroups
            : [],
        )
      : [];

    return {
      correlationId: body.correlationId ?? null,
      terminalGroupsCount: terminalGroups.length + nestedTerminalGroups.length,
    };
  }

  if (endpoint === "/nomenclature") {
    return {
      correlationId: body.correlationId ?? null,
      products: Array.isArray(body.products) ? body.products.length : 0,
      groups: Array.isArray(body.groups) ? body.groups.length : 0,
      productCategories: Array.isArray(body.productCategories)
        ? body.productCategories.length
        : 0,
    };
  }

  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatSyncTime() {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }).format(new Date());
}
