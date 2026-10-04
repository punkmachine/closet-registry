import type { PluginVersionListResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug", { decode: true });
  if (!slug) {
    throw createError({ statusCode: 400, message: "Не указан slug плагина" });
  }

  return await registryFetch<PluginVersionListResponse>(event, `/plugins/${encodeURIComponent(slug)}/versions`);
});
