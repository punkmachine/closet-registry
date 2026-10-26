import type { PluginSource } from "@closet/contract";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug", { decode: true });
  const version = getRouterParam(event, "version", { decode: true });
  if (!slug || !version) {
    throw createError({ statusCode: 400, message: "Не указан slug или version плагина" });
  }

  /** Исходники версии без разворота spec — их правит форма редактирования (bundle отдаёт уже готовые файлы). */
  return await registryFetch<PluginSource>(
    event,
    `/admin/plugins/${encodeURIComponent(slug)}/${encodeURIComponent(version)}/source`,
  );
});
