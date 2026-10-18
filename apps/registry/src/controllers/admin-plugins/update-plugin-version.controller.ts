import type { pluginSlugVersionParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { getAuth } from "../../auth/guards.js";
import { recordAudit } from "../../auth/record-audit.js";
import { BadRequestError } from "../../errors/http-error.js";
import { collectMultipartParts } from "../../registry/multipart-helpers.js";
import type { PublishPluginService } from "../../services/publish-plugin.service.js";

type UpdatePluginVersionRequest = FastifyRequest<{
  Params: z.infer<typeof pluginSlugVersionParamsSchema>;
}>;

/**
 * Полностью заменяет файлы и зависимости существующей версии плагина (multipart).
 *
 * @remarks Это full replace, не patch и не upsert: несуществующую версию сервис не создаёт, а отвечает `404`.
 */
export function createUpdatePluginVersionController(orm: DataSource, service: PublishPluginService) {
  return async function updatePluginVersion(request: UpdatePluginVersionRequest, reply: FastifyReply): Promise<void> {
    const { slug, version } = request.params;

    if (!request.isMultipart()) {
      throw new BadRequestError("Expected multipart/form-data request");
    }

    const { metadataRaw, fileBuffers } = await collectMultipartParts(request);
    const result = await service.update(slug, version, metadataRaw, fileBuffers, getAuth(request).user);

    await recordAudit(orm, request, {
      action: "plugin.update",
      targetType: "plugin_version",
      targetId: `${slug}@${version}`,
    });

    reply.code(200).send(result);
  };
}
