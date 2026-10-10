import type { pluginSlugParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { findActiveVersionsBySlug } from "../../registry/plugins-repository.js";

type ListVersionsRequest = FastifyRequest<{
  Params: z.infer<typeof pluginSlugParamsSchema>;
}>;

/**
 * Отдаёт список активных версий плагина; `404`, если плагина нет.
 */
export function createListVersionsController(orm: DataSource) {
  return async function listVersions(request: ListVersionsRequest, reply: FastifyReply): Promise<void> {
    const { slug } = request.params;
    const versions = await findActiveVersionsBySlug(orm, slug);

    if (versions === null) {
      reply.code(404).send({ error: `Plugin ${slug} not found` });

      return;
    }

    reply.send({
      slug,
      versions: versions.map((item) => ({
        version: item.version,
        changelog: item.changelog,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        fileCount: item.fileCount,
      })),
    });
  };
}
