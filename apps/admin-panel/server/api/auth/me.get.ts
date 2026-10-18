import type { MeResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  return await registryFetch<MeResponse>(event, "/auth/me");
});
