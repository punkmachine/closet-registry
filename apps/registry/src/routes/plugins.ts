import {
  errorResponseSchema,
  pluginBundleParamsSchema,
  pluginBundleResponseSchema,
  pluginListResponseSchema,
  pluginSlugParamsSchema,
  pluginVersionListResponseSchema,
} from "@closet/contract";
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { createGetBundleController } from "../controllers/plugins/get-bundle.controller.js";
import { createListPluginsController } from "../controllers/plugins/list-plugins.controller.js";
import { createListVersionsController } from "../controllers/plugins/list-versions.controller.js";
import { createReadBundleService } from "../services/read-bundle.service.js";

/**
 * Роуты чтения плагинов и их версий.
 */
const pluginsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const orm = fastify.orm;
  const readBundle = createReadBundleService(orm);

  fastify.get(
    "/plugins",
    {
      schema: {
        response: {
          200: pluginListResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    createListPluginsController(orm),
  );

  fastify.get(
    "/plugins/:slug/versions",
    {
      schema: {
        params: pluginSlugParamsSchema,
        response: {
          200: pluginVersionListResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    createListVersionsController(orm),
  );

  fastify.get(
    "/plugins/:slug/:version",
    {
      schema: {
        params: pluginBundleParamsSchema,
        response: {
          200: pluginBundleResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    createGetBundleController(readBundle),
  );
};

export default pluginsRoutes;
