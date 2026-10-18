const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF для cookie-сессии: `sameSite=lax` уже не отдаёт cookie на кросс-сайтовых POST, это второй рубеж.
 * Мутации в /api/** принимаются, только если запрос с того же origin: по `Sec-Fetch-Site`,
 * а когда браузер его не шлёт — по совпадению хоста в `Origin` с хостом самой админки.
 */
export default defineEventHandler((event) => {
  if (SAFE_METHODS.has(event.method) || !event.path.startsWith("/api/")) {
    return;
  }

  const fetchSite = getRequestHeader(event, "sec-fetch-site");

  if (fetchSite) {
    if (fetchSite === "same-origin") {
      return;
    }

    throw createError({ statusCode: 403, message: "Кросс-сайтовый запрос отклонён" });
  }

  const origin = getRequestHeader(event, "origin");
  const host = getRequestHost(event, { xForwardedHost: true });

  if (origin && host) {
    try {
      if (new URL(origin).host === host) {
        return;
      }
    } catch {
      // некорректный Origin — отклоняем ниже
    }
  }

  throw createError({ statusCode: 403, message: "Origin запроса не совпадает с адресом админки" });
});
