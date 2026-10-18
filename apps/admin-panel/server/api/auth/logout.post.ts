export default defineEventHandler(async (event) => {
  if (readSessionToken(event)) {
    try {
      await registryFetch(event, "/auth/logout", { method: "POST" });
    } catch {
      // сессия уже мертва или реестр недоступен — cookie чистим в любом случае
    }
  }
  clearSessionCookie(event);

  return { ok: true as const };
});
