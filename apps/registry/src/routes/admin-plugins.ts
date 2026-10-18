import {
  errorResponseSchema,
  pluginSlugParamsSchema,
  pluginSlugVersionParamsSchema,
  pluginVersionResponseSchema,
} from "@closet/contract";
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { z } from "zod";
import { requirePermission } from "../auth/guards.js";
import { createDeletePluginController } from "../controllers/admin-plugins/delete-plugin.controller.js";
import { createDeletePluginVersionController } from "../controllers/admin-plugins/delete-plugin-version.controller.js";
import { createPublishPluginController } from "../controllers/admin-plugins/publish-plugin.controller.js";
import { createUpdatePluginVersionController } from "../controllers/admin-plugins/update-plugin-version.controller.js";
import { createPublishPluginService } from "../services/publish-plugin.service.js";

const writeGuard = requirePermission("plugins", "write");
const deleteGuard = requirePermission("plugins", "delete");
const adminRateLimitConfig = { rateLimit: { max: 300, timeWindow: "1 minute" } };

/**
 *
 */
const adminPluginsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  const publishService = createPublishPluginService(fastify.orm);

  fastify.post(
    "/plugins",
    {
      schema: {
        response: {
          201: pluginVersionResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
      onRequest: writeGuard,
      config: adminRateLimitConfig,
    },
    createPublishPluginController(fastify.orm, publishService),
  );

  fastify.put(
    "/plugins/:slug/:version",
    {
      schema: {
        params: pluginSlugVersionParamsSchema,
        response: {
          200: pluginVersionResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
      onRequest: writeGuard,
      config: adminRateLimitConfig,
    },
    createUpdatePluginVersionController(fastify.orm, publishService),
  );

  fastify.delete(
    "/plugins/:slug/:version",
    {
      schema: {
        params: pluginSlugVersionParamsSchema,
        response: { 204: z.void(), 404: errorResponseSchema },
      },
      onRequest: deleteGuard,
      config: adminRateLimitConfig,
    },
    createDeletePluginVersionController(fastify.orm),
  );

  fastify.delete(
    "/plugins/:slug",
    {
      schema: {
        params: pluginSlugParamsSchema,
        response: { 204: z.void(), 404: errorResponseSchema },
      },
      onRequest: deleteGuard,
      config: adminRateLimitConfig,
    },
    createDeletePluginController(fastify.orm),
  );
};

export default adminPluginsRoutes;
