export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug", { decode: true });
  const version = getRouterParam(event, "version", { decode: true });
  if (!slug || !version) {
    throw createError({ statusCode: 400, message: "Не указан slug или version плагина" });
  }

  await registryFetch(event, `/admin/plugins/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`, {
    method: "DELETE",
  });
  return { ok: true as const };
});
