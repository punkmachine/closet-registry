import type { pluginSlugParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { NotFoundError } from "../../errors/http-error.js";
import { softDeletePlugin } from "../../registry/plugins-repository.js";

type DeletePluginRequest = FastifyRequest<{
  Params: z.infer<typeof pluginSlugParamsSchema>;
}>;

/**
 * Soft-delete плагина целиком (slug можно переиспользовать повторной публикацией).
 *
 * @remarks Неизвестный или уже удалённый плагин -> `404`.
 */
export function createDeletePluginController(orm: DataSource) {
  return async function deletePlugin(request: DeletePluginRequest, reply: FastifyReply): Promise<void> {
    const { slug } = request.params;

    if (!(await softDeletePlugin(orm, slug))) {
      throw new NotFoundError(`Plugin ${slug} not found`);
    }

    reply.code(204).send();
  };
}
