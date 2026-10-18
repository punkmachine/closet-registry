import type { AuditListResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  const { limit, before } = getQuery<{ limit?: string; before?: string }>(event);
  const params = new URLSearchParams();

  if (limit) {
    params.set("limit", limit);
  }

  if (before) {
    params.set("before", before);
  }

  const query = params.toString();

  return await registryFetch<AuditListResponse>(event, `/admin/audit${query ? `?${query}` : ""}`);
});
