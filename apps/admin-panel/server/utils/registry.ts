import type { H3Event } from "h3";

/**
 * Единственное место, где админка знает ADMIN_TOKEN. Браузер ходит только в /api/** этого
 * же origin, а Bearer-токен подставляется здесь, на сервере — иначе токен от всего реестра
 * (он защищает и чтение, и запись) утёк бы в браузерный бандл.
 */
function resolveRegistryTarget(event: H3Event): { baseUrl: string; token: string } {
  const config = useRuntimeConfig(event);

  // NUXT_REGISTRY_URL / NUXT_REGISTRY_TOKEN — штатный путь Nuxt, REGISTRY_URL / ADMIN_TOKEN —
  // те же имена, что уже есть в общем .env монорепо, чтобы не дублировать секрет под двумя ключами.
  const baseUrl = (config.registryUrl || process.env.REGISTRY_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
  const token = config.registryToken || process.env.ADMIN_TOKEN || "";

  if (!token) {
    throw createError({
      statusCode: 500,
      message: "ADMIN_TOKEN (или NUXT_REGISTRY_TOKEN) не задан — админка не может авторизоваться в реестре",
    });
  }

  return { baseUrl, token };
}

export function registryBaseUrl(event: H3Event): string {
  return resolveRegistryTarget(event).baseUrl;
}

interface RegistryFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: BodyInit;
  contentType?: string | undefined;
}

/**
 * Прокидывает запрос в /v1/** реестра и переводит его ошибки в H3-ошибки с сохранением
 * статуса и текста из тела `{ error }` — иначе на фронте вместо «Plugin foo@1.0.0 not found»
 * был бы безликий 500.
 */
export async function registryFetch<T>(event: H3Event, path: string, options: RegistryFetchOptions = {}): Promise<T> {
  const { baseUrl, token } = resolveRegistryTarget(event);
  const url = `${baseUrl}/v1${path}`;

  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
    });
  } catch (cause) {
    throw createError({
      statusCode: 502,
      message: `Реестр недоступен по адресу ${baseUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
    });
  }

  if (!response.ok) {
    throw createError({ statusCode: response.status, message: await extractErrorMessage(response) });
  }

  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function extractErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `Реестр ответил ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
  } catch {
    // не JSON — отдаём как есть, обрезав, чтобы HTML-страница ошибки не улетела целиком в UI
  }

  return text.slice(0, 500);
}

/**
 * Пробрасывает multipart-запрос байт-в-байт: тело уже собрано браузером в FormData, и
 * пересобирать его на сервере нельзя — boundary из исходного content-type должен совпадать
 * с телом. `readRawBody(event, false)` отдаёт Buffer без попытки распарсить как текст/JSON.
 */
export async function proxyMultipart<T>(event: H3Event, path: string, method: "POST" | "PUT"): Promise<T> {
  const contentType = getRequestHeader(event, "content-type");
  if (!contentType?.includes("multipart/form-data")) {
    throw createError({ statusCode: 400, message: "Ожидается multipart/form-data" });
  }

  const body = await readRawBody(event, false);
  if (!body) {
    throw createError({ statusCode: 400, message: "Пустое тело запроса" });
  }

  return registryFetch<T>(event, path, { method, body: new Uint8Array(body), contentType });
}
