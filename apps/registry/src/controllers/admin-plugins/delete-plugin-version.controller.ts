import type { pluginSlugVersionParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { recordAudit } from "../../auth/record-audit.js";
import { NotFoundError } from "../../errors/http-error.js";
import { softDeleteVersion } from "../../registry/plugins-repository.js";

type DeletePluginVersionRequest = FastifyRequest<{
  Params: z.infer<typeof pluginSlugVersionParamsSchema>;
}>;

/**
 * Soft-delete одной версии плагина.
 *
 * @remarks Неизвестная или уже удалённая версия -> `404`.
 */
export function createDeletePluginVersionController(orm: DataSource) {
  return async function deletePluginVersion(request: DeletePluginVersionRequest, reply: FastifyReply): Promise<void> {
    const { slug, version } = request.params;

    if (!(await softDeleteVersion(orm, slug, version))) {
      throw new NotFoundError(`Plugin ${slug}@${version} not found`);
    }

    await recordAudit(orm, request, {
      action: "plugin.version_delete",
      targetType: "plugin_version",
      targetId: `${slug}@${version}`,
    });

    reply.code(204).send();
  };
}
