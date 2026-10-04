/**
 * Достаёт человекочитаемый текст ошибки из FetchError: Nitro-прокси кладёт сообщение реестра
 * в `data.message` (см. server/utils/registry.ts), и именно его нужно показать пользователю,
 * а не «500 Internal Server Error».
 */
export function errorMessage(error: unknown): string {
  if (!error) {
    return "Неизвестная ошибка";
  }

  const candidate = error as { data?: { message?: unknown; error?: unknown }; statusMessage?: unknown; message?: unknown };

  for (const value of [candidate.data?.message, candidate.data?.error, candidate.statusMessage, candidate.message]) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return String(error);
}
