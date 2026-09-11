import "server-only";

import {
  isValidAuthPassword,
  normalizeAuthUsername,
} from "@/lib/authValidation";
import {
  AuthAccountConflictError,
  AuthAccountStorageError,
  getAuthAccount,
  replaceAuthAccountCredentials,
  type AuthAccount,
  type AuthRole,
} from "@/lib/serverAuthAccountRepository";
import { verifyAuthAccountPassword } from "@/lib/serverAuth";
import { hashAuthPassword } from "@/lib/serverAuthPassword";

export type SafeAuthAccount = Pick<AuthAccount, "role" | "username" | "updatedAt">;

export class AuthAccountManagementError extends Error {
  constructor(
    public readonly code:
      | "ACCOUNT_NOT_FOUND"
      | "CONCURRENT_UPDATE"
      | "INVALID_CURRENT_PASSWORD"
      | "INVALID_PASSWORD"
      | "INVALID_USERNAME"
      | "NO_CHANGES"
      | "PASSWORD_MISMATCH"
      | "STORAGE_UNAVAILABLE",
    message: string,
    public readonly status: 400 | 401 | 404 | 409 | 503,
  ) {
    super(message);
  }
}

export async function getSafeAuthAccounts() {
  try {
    const [admin, barista] = await Promise.all([
      getAuthAccount("admin"),
      getAuthAccount("barista"),
    ]);
    if (!admin || !barista) {
      throw new AuthAccountManagementError(
        "ACCOUNT_NOT_FOUND",
        "Данные доступа не настроены.",
        404,
      );
    }
    return { admin: toSafeAccount(admin), barista: toSafeAccount(barista) };
  } catch (error) {
    if (error instanceof AuthAccountManagementError) throw error;
    throw storageUnavailable(error);
  }
}

export async function updateAuthAccountCredentials(input: {
  role: AuthRole;
  username: string;
  currentPassword?: string;
  newPassword?: string;
  repeatPassword?: string;
}) {
  const username = normalizeAuthUsername(input.username);
  if (!username) {
    throw new AuthAccountManagementError(
      "INVALID_USERNAME",
      "Логин: 3–64 символа, латинские буквы, цифры, точка, дефис или подчёркивание.",
      400,
    );
  }

  const newPassword = input.newPassword ?? "";
  const repeatPassword = input.repeatPassword ?? "";
  if (newPassword !== repeatPassword) {
    throw new AuthAccountManagementError(
      "PASSWORD_MISMATCH",
      "Новый пароль и повтор не совпадают.",
      400,
    );
  }
  if (newPassword && !isValidAuthPassword(newPassword)) {
    throw new AuthAccountManagementError(
      "INVALID_PASSWORD",
      "Новый пароль должен содержать от 12 до 1024 символов.",
      400,
    );
  }

  let current: AuthAccount | null;
  try {
    current = await getAuthAccount(input.role);
  } catch (error) {
    throw storageUnavailable(error);
  }
  if (!current) {
    throw new AuthAccountManagementError(
      "ACCOUNT_NOT_FOUND",
      "Данные доступа не настроены.",
      404,
    );
  }

  if (!newPassword && username === current.username) {
    throw new AuthAccountManagementError(
      "NO_CHANGES",
      "Нет изменений для сохранения.",
      400,
    );
  }

  if (input.role === "admin" && newPassword) {
    const validCurrentPassword = await verifyAuthAccountPassword(
      current,
      input.currentPassword ?? "",
    );
    if (!validCurrentPassword) {
      throw new AuthAccountManagementError(
        "INVALID_CURRENT_PASSWORD",
        "Не удалось подтвердить текущий пароль.",
        401,
      );
    }
  }

  let passwordHash = current.passwordHash;
  if (newPassword) {
    passwordHash = await hashAuthPassword(newPassword);
  }

  try {
    const updated = await replaceAuthAccountCredentials({
      role: input.role,
      username,
      passwordHash,
      expectedCredentialRevision: current.credentialRevision,
    });
    return toSafeAccount(updated);
  } catch (error) {
    if (error instanceof AuthAccountConflictError) {
      throw new AuthAccountManagementError(
        "CONCURRENT_UPDATE",
        "Данные уже изменились. Обновите страницу и повторите попытку.",
        409,
      );
    }
    throw storageUnavailable(error);
  }
}

function toSafeAccount(account: AuthAccount): SafeAuthAccount {
  return {
    role: account.role,
    username: account.username,
    updatedAt: account.updatedAt,
  };
}

function storageUnavailable(error: unknown) {
  if (error instanceof AuthAccountStorageError) {
    return new AuthAccountManagementError(
      "STORAGE_UNAVAILABLE",
      "Сервис данных доступа временно недоступен.",
      503,
    );
  }
  return new AuthAccountManagementError(
    "STORAGE_UNAVAILABLE",
    "Не удалось обновить данные доступа.",
    503,
  );
}
