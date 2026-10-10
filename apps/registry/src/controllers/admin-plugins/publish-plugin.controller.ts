import type { FastifyReply, FastifyRequest } from "fastify";
import { BadRequestError } from "../../errors/http-error.js";
import { collectMultipartParts } from "../../registry/multipart-helpers.js";
import type { PublishPluginService } from "../../services/publish-plugin.service.js";

/**
 * Публикует новую версию плагина из multipart-запроса (поле `metadata` + файлы).
 *
 * @remarks Ошибки валидации/конфликта бросает сервис, статусы мапит глобальный `setErrorHandler`.
 */
export function createPublishPluginController(service: PublishPluginService) {
  return async function publishPlugin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.isMultipart()) {
      throw new BadRequestError("Expected multipart/form-data request");
    }

    const { metadataRaw, fileBuffers } = await collectMultipartParts(request);
    const result = await service.publish(metadataRaw, fileBuffers);

    reply.code(201).send(result);
  };
}
