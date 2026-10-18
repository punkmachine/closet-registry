import type { ApiTokenResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  return await registryFetch<ApiTokenResponse>(event, "/auth/token");
});
