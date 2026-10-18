import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { getAuth } from "../../auth/guards.js";
import { recordAudit } from "../../auth/record-audit.js";
import { BadRequestError } from "../../errors/http-error.js";
import { collectMultipartParts } from "../../registry/multipart-helpers.js";
import type { PublishPluginService } from "../../services/publish-plugin.service.js";

/**
 * Публикует новую версию плагина из multipart-запроса (поле `metadata` + файлы).
 *
 * @remarks Ошибки валидации/конфликта бросает сервис, статусы мапит глобальный `setErrorHandler`.
 */
export function createPublishPluginController(orm: DataSource, service: PublishPluginService) {
  return async function publishPlugin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.isMultipart()) {
      throw new BadRequestError("Expected multipart/form-data request");
    }

    const { metadataRaw, fileBuffers } = await collectMultipartParts(request);
    const result = await service.publish(metadataRaw, fileBuffers, getAuth(request).user);

    await recordAudit(orm, request, {
      action: "plugin.publish",
      targetType: "plugin_version",
      targetId: `${result.slug}@${result.version}`,
    });

    reply.code(201).send(result);
  };
}
