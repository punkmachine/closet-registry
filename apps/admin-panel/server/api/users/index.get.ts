import type { UserListResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  return await registryFetch<UserListResponse>(event, "/admin/users");
});
