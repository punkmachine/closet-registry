import type { PluginListResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  return registryFetch<PluginListResponse>(event, "/plugins");
});
