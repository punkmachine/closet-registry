import type { ApiTokenIssued } from "@closet/contract";

export default defineEventHandler(async (event) => {
  return await registryFetch<ApiTokenIssued>(event, "/auth/token", { method: "POST" });
});
