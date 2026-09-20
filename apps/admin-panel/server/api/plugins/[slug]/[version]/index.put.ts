export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug", { decode: true });
  const version = getRouterParam(event, "version", { decode: true });
  if (!slug || !version) {
    throw createError({ statusCode: 400, message: "Не указан slug или version плагина" });
  }

  // PUT в реестре — full replace: тело должно содержать полный набор файлов и зависимостей версии.
  return proxyMultipart(event, `/admin/plugins/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`, "PUT");
});
