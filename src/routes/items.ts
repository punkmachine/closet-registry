import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";

import { readVersionFiles } from "../registry/file-store.js";
import { getItemVersion, getLatestItemByName, listLatestItems } from "../registry/items-repository.js";
import {
  errorResponseSchema,
  itemFileContentListSchema,
  itemMetadataListSchema,
  itemMetadataSchema,
  itemNameParamsSchema,
  itemNameVersionParamsSchema,
} from "../registry/schemas.js";

const itemsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/items",
    { schema: { response: { 200: itemMetadataListSchema } } },
    async () => listLatestItems(fastify.pg),
  );

  fastify.get(
    "/items/:name",
    {
      schema: {
        params: itemNameParamsSchema,
        response: { 200: itemMetadataSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const { name } = request.params;
      const item = await getLatestItemByName(fastify.pg, name);

      if (!item) {
        reply.code(404).send({ error: `Item ${name} not found` });
        return;
      }

      return item;
    },
  );

  fastify.get(
    "/items/:name/:version/files",
    {
      schema: {
        params: itemNameVersionParamsSchema,
        response: {
          200: itemFileContentListSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name, version } = request.params;
      const item = await getItemVersion(fastify.pg, name, version);

      if (!item) {
        reply.code(404).send({ error: `Item ${name}@${version} not found` });
        return;
      }

      try {
        const files = await readVersionFiles(item.type, name, version, item.files);
        reply.send(files);
      } catch (error) {
        request.log.error(error);
        reply.code(500).send({ error: "Failed to read item files from disk" });
      }
    },
  );
};

export default itemsRoutes;
