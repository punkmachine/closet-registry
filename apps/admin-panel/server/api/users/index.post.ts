import type { UserResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  const body = await readJsonBody(event);
  setResponseStatus(event, 201);

  return await registryFetch<UserResponse>(event, "/admin/users", { method: "POST", ...jsonBody(body) });
});
