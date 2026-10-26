import type { pluginBundleParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import { NotFoundError } from "../../errors/http-error.js";
import { BundleFilesReadError } from "../../services/read-bundle.service.js";
import type { ReadSourceService } from "../../services/read-source.service.js";

type GetPluginSourceRequest = FastifyRequest<{
  Params: z.infer<typeof pluginBundleParamsSchema>;
}>;

/**
 * Отдаёт версию плагина в хранимом виде (spec-файлы не разворачиваются) — для формы редактирования в админке.
 *
 * @remarks `version` может быть литералом `latest`. Неизвестная версия -> `404`, ошибка чтения с диска -> `500`
 * с фиксированным текстом (детали — только в лог).
 */
export function createGetPluginSourceController(service: ReadSourceService) {
  return async function getPluginSource(request: GetPluginSourceRequest, reply: FastifyReply): Promise<void> {
    const { slug, version } = request.params;

    try {
      const source = await service.read(slug, version);

      if (!source) {
        throw new NotFoundError(`Plugin ${slug}@${version} not found`);
      }

      reply.send(source);
    } catch (error) {
      if (error instanceof BundleFilesReadError) {
        request.log.error(error.cause ?? error);
        reply.code(500).send({ error: error.message });

        return;
      }

      throw error;
    }
  };
}
