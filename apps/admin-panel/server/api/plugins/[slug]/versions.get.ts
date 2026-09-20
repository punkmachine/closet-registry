import type { PluginVersionListResponse } from "~~/shared/types/registry";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug", { decode: true });
  if (!slug) {
    throw createError({ statusCode: 400, message: "Не указан slug плагина" });
  }

  return registryFetch<PluginVersionListResponse>(event, `/plugins/${encodeURIComponent(slug)}/versions`);
});
