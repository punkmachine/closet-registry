export function formatBytes(bytes: number | string): string {
  const value = typeof bytes === "string" ? Number(bytes) : bytes;

  if (!Number.isFinite(value)) {
    return "—";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
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
