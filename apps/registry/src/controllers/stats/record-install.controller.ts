import type { statsInstallBodySchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { recordInstall } from "../../db/stats-repository.js";
import { findActiveVersionBySlugAndVersion } from "../../registry/plugins-repository.js";

type RecordInstallRequest = FastifyRequest<{
  Body: z.infer<typeof statsInstallBodySchema>;
}>;

/**
 * Фиксирует факт установки конкретной версии плагина.
 *
 * @remarks Неизвестная (или soft-deleted) пара slug/version -> `400`, а не `404`: это ошибка тела запроса.
 */
export function createRecordInstallController(orm: DataSource) {
  return async function recordInstallHandler(request: RecordInstallRequest, reply: FastifyReply): Promise<void> {
    const { slug, version, cliVersion } = request.body;
    const pluginVersion = await findActiveVersionBySlugAndVersion(orm, slug, version);

    if (!pluginVersion) {
      reply.code(400).send({ error: `Unknown plugin ${slug}@${version}` });

      return;
    }

    await recordInstall(orm, pluginVersion.plugin.id, pluginVersion.id, cliVersion);
    reply.code(202).send({ ok: true });
  };
}
