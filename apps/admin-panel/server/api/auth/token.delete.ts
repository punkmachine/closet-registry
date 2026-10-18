export default defineEventHandler(async (event) => {
  await registryFetch(event, "/auth/token", { method: "DELETE" });

  return { ok: true as const };
});
