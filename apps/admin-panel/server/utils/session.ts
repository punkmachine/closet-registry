import type { H3Event } from "h3";

export const SESSION_COOKIE = "closet-session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Токен сессии реестра (`cls_…`) живёт только в httpOnly-cookie: JS в браузере его не видит.
 * `secure` включается по `x-forwarded-proto`, потому что за Caddy Nitro сам видит http.
 */
export function setSessionCookie(event: H3Event, token: string): void {
  const proto = getRequestHeader(event, "x-forwarded-proto") ?? getRequestProtocol(event);

  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Снимает cookie сессии (выход или смерть сессии на стороне реестра). */
export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE, { path: "/" });
}

/** Токен сессии из cookie или `undefined`, если пользователь не входил. */
export function readSessionToken(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE) || undefined;
}
