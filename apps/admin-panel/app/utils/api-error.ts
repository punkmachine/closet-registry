import { errorMessage } from "~/utils/format";

/**
 * Машинный `code` ошибки реестра (`account_locked`, `account_disabled`…): BFF кладёт его в `data.data.code`.
 */
export function errorCode(error: unknown): string | undefined {
  const code = (error as { data?: { data?: { code?: unknown } } } | null | undefined)?.data?.data?.code;

  return typeof code === "string" ? code : undefined;
}

/** Секунды из заголовка `Retry-After` ответа ошибки или `undefined`. */
export function retryAfterSeconds(error: unknown): number | undefined {
  const headers = (error as { response?: { headers?: { get?: (name: string) => string | null } } } | null | undefined)
    ?.response?.headers;
  const value = Number(headers?.get?.("retry-after"));

  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** «15 мин» / «40 сек» для сообщения о блокировке. */
export function formatWait(seconds: number): string {
  return seconds >= 60 ? `${String(Math.ceil(seconds / 60))} мин` : `${String(Math.ceil(seconds))} сек`;
}

/** Текст ошибки входа: отдельные формулировки для временной блокировки и отключённого аккаунта. */
export function loginFailureMessage(error: unknown): string {
  const code = errorCode(error);

  if (code === "account_locked") {
    const wait = retryAfterSeconds(error);

    return wait
      ? `Аккаунт временно заблокирован из-за неудачных попыток входа. Повторите через ${formatWait(wait)}.`
      : "Аккаунт временно заблокирован из-за неудачных попыток входа. Повторите позже.";
  }

  return code === "account_disabled" ? "Аккаунт отключён администратором." : errorMessage(error);
}
