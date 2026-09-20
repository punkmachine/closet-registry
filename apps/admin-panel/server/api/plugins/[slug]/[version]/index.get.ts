import type { PluginBundle } from "~~/shared/types/registry";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug", { decode: true });
  const version = getRouterParam(event, "version", { decode: true });
  if (!slug || !version) {
    throw createError({ statusCode: 400, message: "Не указан slug или version плагина" });
  }

  // version может быть литералом "latest" — это поддерживает сам реестр.
  return registryFetch<PluginBundle>(event, `/plugins/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`);
});
