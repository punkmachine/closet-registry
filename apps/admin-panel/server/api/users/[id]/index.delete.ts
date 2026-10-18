export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id", { decode: true });

  if (!id) {
    throw createError({ statusCode: 400, message: "Не указан id пользователя" });
  }

  await registryFetch(event, `/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" });

  return { ok: true as const };
});
