import type { H3Event } from "h3";

/**
 * Единственное место, где админка знает токен сессии. Браузер ходит только в /api/** этого же origin,
 * а Bearer подставляется здесь, на сервере, из httpOnly-cookie — в JS страницы токен недоступен.
 */
function resolveRegistryBaseUrl(event: H3Event): string {
  const config = useRuntimeConfig(event);

  return (config.registryUrl || process.env.REGISTRY_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

interface RegistryFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: BodyInit;
  contentType?: string | undefined;
  anonymous?: boolean;
  forwardClient?: boolean;
}

interface RegistryResult<T> {
  data: T;
  status: number;
}

/**
 * Прокидывает запрос в /v1/** реестра и переводит его ошибки в H3-ошибки с сохранением
 * статуса, текста из `{ error }`, машинного `code` и `Retry-After` — иначе на фронте вместо
 * «Account is temporarily locked» был бы безликий 500. `401` на авторизованном запросе
 * означает, что сессия умерла: cookie чистится, фронт уйдёт на /login.
 */
export async function registryFetchRaw<T>(
  event: H3Event,
  path: string,
  options: RegistryFetchOptions = {},
): Promise<RegistryResult<T>> {
  const baseUrl = resolveRegistryBaseUrl(event);
  const url = `${baseUrl}/v1${path}`;

  const headers: Record<string, string> = {};

  if (!options.anonymous) {
    const token = readSessionToken(event);

    if (!token) {
      throw createError({ statusCode: 401, message: "Требуется вход" });
    }

    headers.authorization = `Bearer ${token}`;
  }

  if (options.contentType) {
    headers["content-type"] = options.contentType;
  }

  if (options.forwardClient) {
    const ip = getRequestIP(event, { xForwardedFor: true });

    if (ip) {
      headers["x-forwarded-for"] = ip;
    }

    const userAgent = getRequestHeader(event, "user-agent");

    if (userAgent) {
      headers["user-agent"] = userAgent;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
    });
  } catch (error) {
    throw createError({
      statusCode: 502,
      message: `Реестр недоступен по адресу ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (!response.ok) {
    if (response.status === 401 && !options.anonymous) {
      clearSessionCookie(event);
    }

    const retryAfter = response.headers.get("retry-after");

    if (retryAfter && Number.isFinite(Number(retryAfter))) {
      setResponseHeader(event, "retry-after", Number(retryAfter));
    }

    const { message, code } = await extractError(response);

    throw createError({ statusCode: response.status, message, data: code ? { code } : undefined });
  }

  if (!options.anonymous) {
    setSessionCookie(event, readSessionToken(event) ?? "");
  }

  const empty = response.status === 204 || response.headers.get("content-length") === "0";

  return { data: empty ? (undefined as T) : ((await response.json()) as T), status: response.status };
}

/**
 *
 */
export async function registryFetch<T>(event: H3Event, path: string, options: RegistryFetchOptions = {}): Promise<T> {
  const { data } = await registryFetchRaw<T>(event, path, options);

  return data;
}

/** Тело запроса как `unknown`: валидацию делает реестр по zod-схемам контракта, BFF только проксирует. */
export async function readJsonBody(event: H3Event): Promise<unknown> {
  return await readBody<unknown>(event);
}

/** JSON-тело для мутаций: единая точка, чтобы роуты не повторяли `JSON.stringify` + content-type. */
export function jsonBody(value: unknown): Pick<RegistryFetchOptions, "body" | "contentType"> {
  return { body: JSON.stringify(value), contentType: "application/json" };
}

async function extractError(response: Response): Promise<{ message: string; code?: string }> {
  let text = "";

  try {
    text = await response.text();
  } catch {
    // тело ответа нечитаемо — отдаём сообщение по статусу
  }

  if (!text) {
    return { message: `Реестр ответил ${response.status}` };
  }

  try {
    const parsed = JSON.parse(text) as { error?: unknown; code?: unknown };

    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return typeof parsed.code === "string" ? { message: parsed.error, code: parsed.code } : { message: parsed.error };
    }
  } catch {
    /** не JSON — отдаём как есть, обрезав, чтобы HTML-страница ошибки не улетела целиком в UI */
  }

  return { message: text.slice(0, 500) };
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

  return await registryFetch<T>(event, path, { method, body: new Uint8Array(body), contentType });
}
