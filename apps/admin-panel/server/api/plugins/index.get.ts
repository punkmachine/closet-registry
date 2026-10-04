import type { PluginListResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  return await registryFetch<PluginListResponse>(event, "/plugins");
});
