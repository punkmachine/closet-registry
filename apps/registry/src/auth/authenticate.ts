import type { DataSource } from "typeorm";
import type { User } from "../db/entities/index.js";
import { findActiveApiTokenByHash, touchApiToken } from "./repository/api-tokens.js";
import { findSessionByTokenHash, touchSession } from "./repository/sessions.js";
import { detectTokenKind, hashToken } from "./tokens.js";
import type { AuthContext } from "./types.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Достаёт токен из заголовка `Authorization: Bearer <token>`.
 *
 * @param header - значение заголовка
 * @returns токен или `undefined`, если заголовка нет, схема не Bearer или токен пустой
 */
export function parseBearerToken(header: string | undefined): string | undefined {
  const token = header?.startsWith(BEARER_PREFIX) === true ? header.slice(BEARER_PREFIX.length) : "";

  return token || undefined;
}

function isUsable(user: User): boolean {
  return !user.deleted && !user.disabled;
}

/**
 * Находит владельца токена сессии или API-токена. Просроченная сессия, отозванный токен, удалённый
 * или заблокированный админом пользователь — `null` (одинаковый `401`, без различий для клиента).
 * Успешное использование продлевает сессию / обновляет `last_used_at` (с троттлингом внутри репозиториев).
 *
 * @param dataSource - источник данных
 * @param token - значение токена из заголовка
 * @param now - текущее время
 * @returns контекст авторизации или `null`
 */
export async function authenticateToken(
  dataSource: DataSource,
  token: string,
  now: Date = new Date(),
): Promise<AuthContext | null> {
  const kind = detectTokenKind(token);

  if (kind === null) {
    return null;
  }

  const tokenHash = hashToken(token);

  if (kind === "session") {
    const session = await findSessionByTokenHash(dataSource, tokenHash);

    if (!session || session.expiresAt.getTime() <= now.getTime() || !isUsable(session.user)) {
      return null;
    }

    await touchSession(dataSource, session, now);

    return { user: session.user, kind, credentialId: session.id };
  }

  const apiToken = await findActiveApiTokenByHash(dataSource, tokenHash);

  if (!apiToken || !isUsable(apiToken.user)) {
    return null;
  }

  await touchApiToken(dataSource, apiToken, now);

  return { user: apiToken.user, kind, credentialId: apiToken.id };
}
