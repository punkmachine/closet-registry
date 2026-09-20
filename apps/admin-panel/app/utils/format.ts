export function formatBytes(bytes: number | string): string {
  const value = typeof bytes === "string" ? Number(bytes) : bytes;
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
