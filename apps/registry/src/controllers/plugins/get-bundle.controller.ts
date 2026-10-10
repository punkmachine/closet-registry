import type { pluginBundleParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";
import type { ReadBundleService } from "../../services/read-bundle.service.js";
import { BundleFilesReadError } from "../../services/read-bundle.service.js";

type GetBundleRequest = FastifyRequest<{
  Params: z.infer<typeof pluginBundleParamsSchema>;
}>;

/**
 * Отдаёт все файлы версии плагина одним bundle-ответом.
 *
 * @remarks `version` может быть литералом `latest`. Ошибка чтения файлов с диска -> `500`
 * с фиксированным текстом (детали уходят только в лог).
 */
export function createGetBundleController(service: ReadBundleService) {
  return async function getBundle(request: GetBundleRequest, reply: FastifyReply): Promise<void> {
    const { slug, version } = request.params;

    try {
      const bundle = await service.read(slug, version);

      if (!bundle) {
        reply.code(404).send({ error: `Plugin ${slug}@${version} not found` });
        return;
      }

      reply.send(bundle);
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
