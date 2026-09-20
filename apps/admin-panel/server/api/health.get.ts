/**
 * Здоровье самой админки + доступность реестра. Всегда 200, даже если реестр лежит:
 * это healthcheck контейнера admin-panel, и падение реестра не должно перезапускать админку.
 * Состояние реестра отдаётся отдельным полем и показывается в шапке интерфейса.
 */
export default defineEventHandler(async (event) => {
  const baseUrl = (process.env.NUXT_REGISTRY_URL || process.env.REGISTRY_URL || "http://127.0.0.1:3000").replace(
    /\/+$/,
    "",
  );

  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      return { status: "ok" as const, registry: "error" as const, registryUrl: baseUrl };
    }

    const body = (await response.json()) as { status?: string; db?: string };
    return {
      status: "ok" as const,
      registry: "ok" as const,
      registryDb: body.db === "ok" ? ("ok" as const) : ("error" as const),
      registryUrl: baseUrl,
    };
  } catch {
    return { status: "ok" as const, registry: "unreachable" as const, registryUrl: baseUrl };
  }
});
