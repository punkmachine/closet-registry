import type { PluginListResponse } from "~~/shared/types/registry";

export default defineEventHandler(async (event) => {
  return registryFetch<PluginListResponse>(event, "/plugins");
});
