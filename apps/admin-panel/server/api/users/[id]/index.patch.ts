import type { UserResponse } from "@closet/contract";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id", { decode: true });
  if (!id) {
    throw createError({ statusCode: 400, message: "Не указан id пользователя" });
  }

  const body = await readJsonBody(event);

  return await registryFetch<UserResponse>(event, `/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    ...jsonBody(body),
  });
});
