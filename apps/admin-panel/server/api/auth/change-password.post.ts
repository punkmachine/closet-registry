export default defineEventHandler(async (event) => {
  const body = await readJsonBody(event);

  await registryFetch(event, "/auth/change-password", { method: "POST", ...jsonBody(body) });

  return { ok: true as const };
});
