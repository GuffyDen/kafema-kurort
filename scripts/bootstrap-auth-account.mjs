import { randomBytes, scrypt } from "node:crypto";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { createClient } from "redis";

const supportedRoles = new Set(["barista", "admin"]);

export async function bootstrapAuthAccount(input) {
  const role = normalizeRole(input.role);
  const username = normalizeUsername(input.username);
  const tenantId = normalizeTenantId(input.tenantId);
  if (!role || !username || !tenantId) throw new Error("INVALID_ACCOUNT");
  const passwordHash = await hashPassword(input.password);
  const key = `tablo:tenant:${tenantId}:auth-account:v1:${role}`;
  const now = input.now ?? new Date().toISOString();

  if (!input.replace) {
    const account = {
      role,
      username,
      passwordHash,
      credentialRevision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const result = await input.sendCommand(["SET", key, JSON.stringify(account), "NX"]);
    return result === "OK"
      ? { status: "created", role, credentialRevision: 1 }
      : { status: "exists", role };
  }

  const script = [
    "local raw = redis.call('GET', KEYS[1])",
    "if not raw then return {'MISSING'} end",
    "local current = cjson.decode(raw)",
    "current.role = ARGV[1]",
    "current.username = ARGV[2]",
    "current.passwordHash = ARGV[3]",
    "current.updatedAt = ARGV[4]",
    "current.credentialRevision = tonumber(current.credentialRevision) + 1",
    "redis.call('SET', KEYS[1], cjson.encode(current))",
    "return {'REPLACED', tostring(current.credentialRevision)}",
  ].join("\n");
  const result = await input.sendCommand([
    "EVAL",
    script,
    "1",
    key,
    role,
    username,
    passwordHash,
    now,
  ]);
  const values = Array.isArray(result) ? result : [];
  return values[0] === "REPLACED"
    ? { status: "replaced", role, credentialRevision: Number(values[1]) }
    : { status: "missing", role };
}

export async function bootstrapAuthAccountViaVercel(input) {
  const origin = getProductionOrigin(input.productionUrl);
  if (!origin || typeof input.oidcToken !== "string" || !input.oidcToken) {
    throw new Error("VERCEL_BOOTSTRAP_UNAVAILABLE");
  }

  const response = await input.fetchImpl(
    `${origin}/api/internal/auth/bootstrap`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.oidcToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: input.role,
        username: input.username,
        password: input.password,
        replace: Boolean(input.replace),
        confirmation: `${input.replace ? "REPLACE" : "CREATE"} ${input.role}`,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && typeof payload.code === "string" ? payload.code : null;
    const error = new Error(code || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 1_024) {
    throw new Error("INVALID_PASSWORD");
  }
  const cost = 65_536;
  const blockSize = 8;
  const parallelization = 1;
  const salt = randomBytes(16);
  const digest = await new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: cost, r: blockSize, p: parallelization, maxmem: 128 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolve(value)),
    );
  });
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

function normalizeRole(value) {
  return typeof value === "string" && supportedRoles.has(value) ? value : null;
}

function normalizeUsername(value) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) ? normalized : null;
}

function normalizeTenantId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
    ? value
    : null;
}

async function main() {
  if (!process.argv.includes("--production")) {
    fail("Для записи требуется явный флаг --production.");
    return;
  }
  const role = process.argv.find((value) => value.startsWith("--role="))?.slice(7);
  const replace = process.argv.includes("--replace");
  if (!normalizeRole(role)) {
    fail("Укажите --role=barista или --role=admin.");
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail("Bootstrap запускается только интерактивно в TTY.");
    return;
  }

  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const usernameInput = await prompt.question(
      role === "barista" ? "Username [barista]: " : "Username: ",
    );
    const username = usernameInput || (role === "barista" ? "barista" : "");
    const passwordQuestion = prompt.question("Password: ");
    muted = true;
    const password = await passwordQuestion;
    muted = false;
    process.stdout.write("\n");
    const confirmationQuestion = prompt.question("Repeat password: ");
    muted = true;
    const confirmation = await confirmationQuestion;
    muted = false;
    process.stdout.write("\n");
    if (password !== confirmation) {
      fail("Пароли не совпадают.");
      return;
    }
    if (password.length < 12) {
      fail("Пароль должен содержать не менее 12 символов.");
      return;
    }
    const confirmationPhrase = replace ? `REPLACE ${role}` : `CREATE ${role}`;
    const explicit = await prompt.question(`Введите ${confirmationPhrase}: `);
    if (explicit !== confirmationPhrase) {
      fail("Операция отменена.");
      return;
    }

    const redisUrl = process.env.REDIS_URL?.trim();
    const tenantId = normalizeTenantId(process.env.IIKO_TERMINAL_GROUP_ID?.trim());
    let result;
    if (/^rediss?:\/\//.test(redisUrl ?? "") && tenantId) {
      const client = createClient({ url: redisUrl, disableOfflineQueue: true });
      client.on("error", () => undefined);
      try {
        await client.connect();
        result = await bootstrapAuthAccount({
          sendCommand: (command) => client.sendCommand(command),
          tenantId,
          role,
          username,
          password,
          replace,
        });
      } finally {
        if (client.isOpen) client.destroy();
      }
    } else if (
      process.env.VERCEL_ENV === "production" &&
      process.env.VERCEL_OIDC_TOKEN
    ) {
      result = await bootstrapAuthAccountViaVercel({
        fetchImpl: fetch,
        productionUrl:
          process.env.VERCEL_PROJECT_PRODUCTION_URL ||
          process.env.NEXT_PUBLIC_APP_URL,
        oidcToken: process.env.VERCEL_OIDC_TOKEN,
        role,
        username,
        password,
        replace,
      });
    } else {
      fail(
        "Bootstrap недоступен: запустите auth:bootstrap:production через Vercel CLI.",
      );
      return;
    }

    if (result.status === "exists") {
      fail("Аккаунт уже существует. Запись не изменена.", 2);
    } else if (result.status === "missing") {
      fail("Аккаунт для замены не найден.", 2);
    } else {
      process.stdout.write(`Auth account ${result.status}: ${role}.\n`);
    }
  } catch (error) {
    if (error?.message === "ACCOUNT_EXISTS") {
      fail("Аккаунт уже существует. Запись не изменена.", 2);
    } else if (error?.message === "ACCOUNT_MISSING") {
      fail("Аккаунт для замены не найден.", 2);
    } else if (error?.status === 404) {
      fail("Bootstrap route ещё не опубликован в production.");
    } else {
      fail("Не удалось безопасно создать auth account в production Redis.");
    }
  } finally {
    muted = false;
    prompt.close();
  }
}

function getProductionOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    const url = new URL(candidate);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exitCode = code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
