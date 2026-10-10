import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { findAllActivePluginsWithLatestVersion } from "../../registry/plugins-repository.js";

/**
 * Листинг метаданных всех плагинов с последней активной версией (под `closet-cli list --all`).
 *
 * @remarks Без query-параметров и без rate limit — как и у остальных GET.
 */
export function createListPluginsController(orm: DataSource) {
  return async function listPlugins(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const plugins = await findAllActivePluginsWithLatestVersion(orm);

    reply.send({
      plugins: plugins.map((plugin) => ({
        slug: plugin.slug,
        description: plugin.description,
        latestVersion: plugin.latestVersion,
        updatedAt: plugin.updatedAt.toISOString(),
      })),
    });
  };
}
