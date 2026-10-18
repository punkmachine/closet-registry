export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id", { decode: true });

  if (!id) {
    throw createError({ statusCode: 400, message: "Не указан id пользователя" });
  }

  const body = await readJsonBody(event);

  await registryFetch(event, `/admin/users/${encodeURIComponent(id)}/reset-password`, {
    method: "POST",
    ...jsonBody(body),
  });

  return { ok: true as const };
});
