import { createHash, randomBytes } from "node:crypto";

export const API_TOKEN_PREFIX = "clt_";
export const SESSION_TOKEN_PREFIX = "cls_";

const TOKEN_BYTES = 32;
const DISPLAY_PREFIX_LENGTH = 8;

export interface GeneratedToken {
  value: string;
  hash: string;
}

export type TokenKind = "api" | "session";

/**
 * Генерирует токен с заданным префиксом.
 *
 * @param prefix - префикс токена
 * @returns значение и его хеш
 */
function generate(prefix: string): GeneratedToken {
  const value = `${prefix}${randomBytes(TOKEN_BYTES).toString("base64url")}`;

  return { value, hash: hashToken(value) };
}

/**
 * sha256 токена в hex. Токены случайные и длинные, поэтому быстрый хеш без соли достаточен.
 *
 * @param value - полное значение токена
 * @returns хеш в hex
 */
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Генерирует персональный API-токен `clt_…`.
 *
 * @returns значение и его хеш
 */
export function generateApiToken(): GeneratedToken {
  return generate(API_TOKEN_PREFIX);
}

/**
 * Генерирует токен сессии `cls_…`.
 *
 * @returns значение и его хеш
 */
export function generateSessionToken(): GeneratedToken {
  return generate(SESSION_TOKEN_PREFIX);
}

/**
 * Начало токена для отображения в UI.
 *
 * @param value - полное значение токена
 * @returns первые `DISPLAY_PREFIX_LENGTH` символов
 */
export function tokenDisplayPrefix(value: string): string {
  return value.slice(0, DISPLAY_PREFIX_LENGTH);
}

/**
 * Определяет тип токена по префиксу.
 *
 * @param value - значение токена из заголовка
 * @returns тип или `null`, если префикс незнакомый (тогда в БД искать незачем)
 */
export function detectTokenKind(value: string): TokenKind | null {
  if (value.startsWith(API_TOKEN_PREFIX)) {
    return "api";
  }

  return value.startsWith(SESSION_TOKEN_PREFIX) ? "session" : null;
}
