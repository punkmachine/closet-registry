export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug", { decode: true });
  if (!slug) {
    throw createError({ statusCode: 400, message: "Не указан slug плагина" });
  }

  // Реестр делает soft delete: плагин и все его версии помечаются удалёнными, файлы на диске остаются.
  await registryFetch(event, `/admin/plugins/${encodeURIComponent(slug)}`, { method: "DELETE" });
  return { ok: true as const };
});
