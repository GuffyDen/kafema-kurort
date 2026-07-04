import {
  iikoReadOnlyRequests,
  type IikoConnectionInput,
  type IikoConnectionResult,
  type IikoOrganization,
  type IikoSyncSummary,
} from "@/lib/iikoReadOnlyProvider";

type IikoClientConfig = {
  apiBaseUrl: string;
  apiRootUrl: string;
  legacyApiLogin: string;
  apiKey: string;
  appId: string;
  clientSecret: string;
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

export type IikoTerminalGroupDiagnostic = {
  organizationId: string | null;
  organizationName: string | null;
  terminalGroupId: string;
  terminalGroupName: string | null;
  terminalGroupAddress: string | null;
  isDeleted: boolean | null;
  status: string | null;
};

export type IikoReadOnlyCheckResult = {
  ok: boolean;
  authVersion: "v2";
  tokenReceived: boolean;
  authHttpStatus: number | null;
  authError: string | null;
  organizationsCount: number;
  selectedOrganizationId: string | null;
  selectedOrganizationName: string | null;
  terminalGroupsCount: number;
  terminalGroupFound: boolean;
  terminalGroupId: string | null;
  selectedTerminalGroupId: string | null;
  selectedTerminalGroupName: string | null;
  availableTerminalGroups: IikoTerminalGroupDiagnostic[];
  menuReceived: boolean;
  productsCount: number;
  categoriesCount: number;
  modifiersCount: number;
  counts: IikoSyncSummary;
  endpoints: IikoEndpointCheck[];
  rawErrors: IikoCheckError[];
  errors: IikoCheckError[];
  result?: IikoConnectionResult;
};

type IikoCheckError = {
    step: string;
    endpoint?: string;
    status?: number;
    message: string;
    response?: unknown;
};

type IikoApiOrganization = {
  id?: string;
  name?: string;
};

type IikoApiTerminalGroup = {
  id?: string;
  terminalGroupId?: string;
  name?: string;
  terminalGroupName?: string;
  organizationId?: string;
  organizationName?: string;
  address?: string | null;
  terminalGroupAddress?: string | null;
  isDeleted?: boolean | null;
  deleted?: boolean | null;
  status?: string | null;
  items?: IikoApiTerminalGroup[];
};

type IikoApiTerminalGroupsOrganization = {
  id?: string;
  name?: string;
  organizationId?: string;
  organizationName?: string;
  terminalGroups?: IikoApiTerminalGroup[];
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
  items?: Array<IikoApiGroup | IikoApiProduct>;
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
  const apiBaseUrl = trimTrailingSlash(
    process.env.IIKO_API_BASE_URL || defaultBaseUrl,
  );

  return {
    apiBaseUrl,
    apiRootUrl: deriveApiRootUrl(apiBaseUrl),
    legacyApiLogin:
      input?.apiLogin?.trim() || process.env.IIKO_API_LOGIN?.trim() || "",
    apiKey: input?.apiKey?.trim() || process.env.IIKO_API_KEY?.trim() || "",
    appId: process.env.IIKO_APP_ID?.trim() || "",
    clientSecret: process.env.IIKO_CLIENT_SECRET?.trim() || "",
    terminalGroupId: process.env.IIKO_TERMINAL_GROUP_ID?.trim() || "",
  };
}

export function hasIikoCredentials(config: IikoClientConfig) {
  return Boolean(
    config.apiKey &&
      config.appId &&
      config.clientSecret &&
      config.terminalGroupId,
  );
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
  const errors: IikoCheckError[] = [];
  const emptyCounts = createSummary(null, 0, null);
  const baseResult = createBaseCheckResult(config, emptyCounts, endpoints, errors);
  const credentialErrors = getMissingCredentialErrors(config);

  if (credentialErrors.length > 0) {
    errors.push(...credentialErrors);
    return {
      ...baseResult,
      errors,
      rawErrors: errors,
    };
  }

  try {
    const token = await getAccessToken(config, endpoints);
    const organizations = await getOrganizations(config, token, endpoints);

    if (organizations.length === 0) {
      throw new Error("iiko не вернула ни одной организации");
    }

    const terminalGroups = await getTerminalGroups(
      config,
      token,
      organizations,
      endpoints,
    );
    const terminalGroup = terminalGroups.find(
      (group) => group.id === config.terminalGroupId,
    );
    const availableTerminalGroups = createTerminalGroupDiagnostics(
      terminalGroups,
      organizations,
    );

    if (!terminalGroup) {
      const partialCounts = createSummary(null, terminalGroups.length, null);
      const terminalGroupError = {
        step: "terminal_groups",
        endpoint: "/api/1/terminal_groups",
        message: `TerminalGroupId ${config.terminalGroupId} не найден среди доступных terminal groups`,
      };
      errors.push(terminalGroupError);

      return {
        ...baseResult,
        counts: partialCounts,
        tokenReceived: true,
        authHttpStatus: getEndpointStatus(endpoints, "/api/v2/access_token"),
        authError: null,
        organizationsCount: organizations.length,
        terminalGroupsCount: terminalGroups.length,
        terminalGroupFound: false,
        terminalGroupId: config.terminalGroupId,
        availableTerminalGroups,
        endpoints,
        errors,
        rawErrors: errors,
      };
    }

    const selectedOrganization = selectOrganizationByTerminalGroup(
      organizations,
      terminalGroup,
    );

    if (!selectedOrganization) {
      throw new Error(
        `Не удалось определить организацию для terminalGroupId ${config.terminalGroupId}`,
      );
    }

    const menu = await getMenu(config, token, selectedOrganization.id, endpoints);
    const summary = createSummary(menu, terminalGroups.length, null);
    const result: IikoConnectionResult = {
      status: "connected",
      mode: "real",
      authVersion: "v2",
      tokenReceived: Boolean(token),
      menuReceived: Boolean(menu),
      organization: {
        ...selectedOrganization,
        terminalGroupId: terminalGroup.id,
      },
      organizations: organizations.map((organization) => ({
        ...organization,
        terminalGroupId: terminalGroups.find(
          (group) => group.organizationId === organization.id,
        )?.id,
      })),
      version: "Cloud API v2 auth + v1 nomenclature",
      lastSyncAt: formatSyncTime(),
      summary,
    };

    return {
      ok: true,
      authVersion: "v2",
      tokenReceived: true,
      authHttpStatus: getEndpointStatus(endpoints, "/api/v2/access_token"),
      authError: null,
      organizationsCount: organizations.length,
      selectedOrganizationId: selectedOrganization.id,
      selectedOrganizationName: selectedOrganization.name,
      terminalGroupsCount: terminalGroups.length,
      terminalGroupFound: true,
      terminalGroupId: config.terminalGroupId,
      selectedTerminalGroupId: terminalGroup.id ?? null,
      selectedTerminalGroupName: terminalGroup.name ?? null,
      availableTerminalGroups,
      menuReceived: true,
      productsCount: summary.products,
      categoriesCount: summary.categories,
      modifiersCount: summary.modifiers,
      counts: summary,
      endpoints,
      errors,
      rawErrors: errors,
      result,
    };
  } catch (error) {
    errors.push(createCheckError(error));
    const authEndpoint = endpoints.find(
      (endpoint) => endpoint.endpoint === "/api/v2/access_token",
    );

    return {
      ...baseResult,
      tokenReceived: Boolean(authEndpoint?.ok),
      authHttpStatus: authEndpoint?.status ?? null,
      authError: authEndpoint?.error ?? null,
      endpoints,
      errors,
      rawErrors: errors,
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
  return requestIiko<{ token?: string }>(
    config,
    "/api/v2/access_token",
    {
      apiLogin: config.apiKey,
      appId: config.appId,
      clientSecret: config.clientSecret,
    },
    undefined,
    endpoints,
  );
}

async function getOrganizations(
  config: IikoClientConfig,
  token: string,
  endpoints?: IikoEndpointCheck[],
) {
  const data = await requestIiko<{ organizations?: IikoApiOrganization[] }>(
    config,
    "/api/1/organizations",
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
    organizations?: IikoApiTerminalGroupsOrganization[];
  }>(
    config,
    "/api/1/terminal_groups",
    {
      organizationIds: organizations.map((organization) => organization.id),
      includeDisabled: false,
    },
    token,
    endpoints,
  );

  return [
    ...(data.terminalGroups ?? []).flatMap((group) => {
      const organizationId = group.organizationId;
      const organizationName = group.organizationName;

      if (Array.isArray(group.items)) {
        return group.items.map((item) => ({
          ...item,
          organizationId: item.organizationId ?? organizationId,
          organizationName: item.organizationName ?? organizationName,
        }));
      }

      return [group];
    }),
    ...(data.organizations ?? []).flatMap(
      (organization) => {
        const organizationId = organization.organizationId ?? organization.id;
        const organizationName = organization.organizationName ?? organization.name;

        return (organization.terminalGroups ?? []).map((group) => ({
          ...group,
          id: group.id ?? group.terminalGroupId,
          name: group.name ?? group.terminalGroupName,
          organizationId: group.organizationId ?? organizationId,
          organizationName,
        }));
      },
    ),
  ]
    .map((group) => ({
      ...group,
      id: group.id ?? group.terminalGroupId,
      name: group.name ?? group.terminalGroupName,
    }))
    .filter((group) => Boolean(group.id));
}

async function getMenu(
  config: IikoClientConfig,
  token: string,
  organizationId: string,
  endpoints?: IikoEndpointCheck[],
) {
  return requestIiko<IikoApiNomenclature>(
    config,
    "/api/1/nomenclature",
    { organizationId, startRevision: 0 },
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

  const response = await fetch(`${config.apiRootUrl}${endpoint}`, {
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
  const errorMessage = sanitizeSensitiveValue(
    getIikoErrorMessage(parsedBody, rawBody),
  );

  endpoints?.push({
    method: "POST",
    endpoint,
    mode: metadata?.mode ?? "read-only",
    status: response.status,
    ok: response.ok,
    response: responseSummary,
    ...(response.ok ? {} : { error: errorMessage }),
  });

  if (!response.ok) {
    throw new IikoHttpError(
      response.status,
      endpoint,
      errorMessage,
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
  const products = countNomenclatureProducts(menu);
  const categories =
    menu?.productCategories?.length ?? countGroups(menu?.groups ?? []);
  const modifiers =
    collectNomenclatureProducts(menu).reduce(
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

function countNomenclatureProducts(menu: IikoApiNomenclature | null) {
  return collectNomenclatureProducts(menu).length;
}

function collectNomenclatureProducts(menu: IikoApiNomenclature | null) {
  const products = [...(menu?.products ?? [])];

  for (const group of menu?.groups ?? []) {
    products.push(...collectProductsFromGroup(group));
  }

  return products;
}

function collectProductsFromGroup(group: IikoApiGroup): IikoApiProduct[] {
  return (group.items ?? []).flatMap((item) => {
    if (isNomenclatureGroup(item)) {
      return collectProductsFromGroup(item);
    }

    return [item];
  });
}

function isNomenclatureGroup(
  item: IikoApiGroup | IikoApiProduct,
): item is IikoApiGroup {
  return Array.isArray((item as IikoApiGroup).items);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function deriveApiRootUrl(apiBaseUrl: string) {
  const trimmed = trimTrailingSlash(apiBaseUrl);
  const match = trimmed.match(/^(.*)\/api(?:\/(?:1|v1|v2))?$/);

  return match?.[1] ?? trimmed;
}

function getMissingCredentialErrors(config: IikoClientConfig): IikoCheckError[] {
  const missing: IikoCheckError[] = [];

  if (!config.apiKey) {
    missing.push({
      step: "credentials",
      message: "Ожидаю IIKO_API_KEY в серверных переменных окружения",
    });
  }

  if (!config.appId) {
    missing.push({
      step: "credentials",
      message: "Ожидаю IIKO_APP_ID в серверных переменных окружения",
    });
  }

  if (!config.clientSecret) {
    missing.push({
      step: "credentials",
      message: "Ожидаю IIKO_CLIENT_SECRET в серверных переменных окружения",
    });
  }

  if (!config.terminalGroupId) {
    missing.push({
      step: "credentials",
      message: "Ожидаю IIKO_TERMINAL_GROUP_ID в серверных переменных окружения",
    });
  }

  return missing;
}

function createBaseCheckResult(
  config: IikoClientConfig,
  counts: IikoSyncSummary,
  endpoints: IikoEndpointCheck[],
  errors: IikoCheckError[],
): IikoReadOnlyCheckResult {
  return {
    ok: false,
    authVersion: "v2",
    tokenReceived: false,
    authHttpStatus: getEndpointStatus(endpoints, "/api/v2/access_token"),
    authError:
      endpoints.find((endpoint) => endpoint.endpoint === "/api/v2/access_token")
        ?.error ?? null,
    organizationsCount: 0,
    selectedOrganizationId: null,
    selectedOrganizationName: null,
    terminalGroupsCount: 0,
    terminalGroupFound: false,
    terminalGroupId: config.terminalGroupId || null,
    selectedTerminalGroupId: null,
    selectedTerminalGroupName: null,
    availableTerminalGroups: [],
    menuReceived: false,
    productsCount: 0,
    categoriesCount: 0,
    modifiersCount: 0,
    counts,
    endpoints,
    errors,
    rawErrors: errors,
  };
}

function selectOrganizationByTerminalGroup(
  organizations: IikoOrganization[],
  terminalGroup: IikoApiTerminalGroup,
) {
  if (organizations.length === 1) {
    return organizations[0];
  }

  return organizations.find(
    (organization) => organization.id === terminalGroup.organizationId,
  );
}

function createTerminalGroupDiagnostics(
  terminalGroups: IikoApiTerminalGroup[],
  organizations: IikoOrganization[],
): IikoTerminalGroupDiagnostic[] {
  return terminalGroups.map((group) => {
    const organization = organizations.find(
      (item) => item.id === group.organizationId,
    );

    return {
      organizationId: group.organizationId ?? null,
      organizationName: group.organizationName ?? organization?.name ?? null,
      terminalGroupId: String(group.id),
      terminalGroupName: group.name ?? null,
      terminalGroupAddress:
        group.terminalGroupAddress ?? group.address ?? null,
      isDeleted: group.isDeleted ?? group.deleted ?? null,
      status: group.status ?? null,
    };
  });
}

function getEndpointStatus(endpoints: IikoEndpointCheck[], endpoint: string) {
  return endpoints.find((item) => item.endpoint === endpoint)?.status ?? null;
}

function createCheckError(error: unknown) {
  if (error instanceof IikoHttpError) {
    return {
      step: error.endpoint,
      endpoint: error.endpoint,
      status: error.status,
      message: error.message,
      response: sanitizeSensitive(error.response),
    };
  }

  return {
    step: "check",
    message: sanitizeSensitiveValue(
      error instanceof Error ? error.message : "Не удалось проверить iiko",
    ),
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
    return typeof body === "string"
      ? sanitizeSensitiveValue(body.slice(0, 500))
      : sanitizeSensitive(body);
  }

  if (endpoint === "/api/v2/access_token") {
    return {
      token: typeof body.token === "string" ? "[received]" : null,
      error: body.error ?? null,
      errorDescription: body.errorDescription ?? null,
      message: body.message ?? null,
      title: body.title ?? null,
      correlationId: body.correlationId ?? null,
    };
  }

  if (endpoint === "/api/1/organizations") {
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

  if (endpoint === "/api/1/terminal_groups") {
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
    const terminalGroupSummary = summarizeTerminalGroupsFromResponse(body);

    return {
      correlationId: body.correlationId ?? null,
      terminalGroupsCount:
        terminalGroupSummary.length || terminalGroups.length + nestedTerminalGroups.length,
      terminalGroups: terminalGroupSummary,
    };
  }

  if (endpoint === "/api/1/nomenclature") {
    const nomenclature = body as IikoApiNomenclature;

    return {
      correlationId: body.correlationId ?? null,
      products: countNomenclatureProducts(nomenclature),
      topLevelProducts: Array.isArray(body.products) ? body.products.length : 0,
      groups: Array.isArray(body.groups) ? body.groups.length : 0,
      productCategories: Array.isArray(body.productCategories)
        ? body.productCategories.length
        : 0,
      sizes: Array.isArray(body.sizes) ? body.sizes.length : 0,
      revision: body.revision ?? null,
    };
  }

  return sanitizeSensitive(body);
}

function summarizeTerminalGroupsFromResponse(body: Record<string, unknown>) {
  const topLevelGroups = Array.isArray(body.terminalGroups)
    ? body.terminalGroups.flatMap((group) => {
        if (!isRecord(group)) {
          return [{ group, organizationId: null, organizationName: null }];
        }

        const organizationId = getStringValue(group.organizationId);
        const organizationName = getStringValue(group.organizationName);

        if (Array.isArray(group.items)) {
          return group.items.map((item) => ({
            group: item,
            organizationId,
            organizationName,
          }));
        }

        return [{ group, organizationId, organizationName }];
      })
    : [];
  const nestedGroups = Array.isArray(body.organizations)
    ? body.organizations.flatMap((organization) => {
        if (!isRecord(organization) || !Array.isArray(organization.terminalGroups)) {
          return [];
        }

        const organizationId = getStringValue(
          organization.organizationId,
          organization.id,
        );
        const organizationName = getStringValue(
          organization.organizationName,
          organization.name,
        );

        return organization.terminalGroups.map((group) => ({
          group,
          organizationId,
          organizationName,
        }));
      })
    : [];

  return [...topLevelGroups, ...nestedGroups]
    .map(({ group, organizationId, organizationName }) => {
      if (!isRecord(group)) return null;

      return {
        organizationId: getStringValue(group.organizationId) ?? organizationId,
        organizationName:
          getStringValue(group.organizationName) ?? organizationName,
        terminalGroupId: getStringValue(group.id, group.terminalGroupId),
        terminalGroupName: getStringValue(group.name, group.terminalGroupName),
        terminalGroupAddress: getStringValue(
          group.terminalGroupAddress,
          group.address,
        ),
        isDeleted: getBooleanValue(group.isDeleted, group.deleted),
        status: getStringValue(group.status),
      };
    })
    .filter(Boolean);
}

function sanitizeSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitive(item));
  }

  if (!isRecord(value)) {
    return typeof value === "string" ? sanitizeSensitiveValue(value) : value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? "********" : sanitizeSensitive(item),
    ]),
  );
}

function sanitizeSensitiveValue(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._=-]+/g, "Bearer ********")
    .replace(/("?(?:apiLogin|apiKey|appId|clientSecret|token)"?\s*[:=]\s*)"[^"]+"/gi, "$1\"********\"");
}

function isSensitiveKey(key: string) {
  return /^(apiLogin|apiKey|appId|clientSecret|token|accessToken|authorization)$/i.test(
    key,
  );
}

function getStringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

function getBooleanValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
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
