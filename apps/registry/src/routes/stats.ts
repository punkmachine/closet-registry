import { errorResponseSchema, statsInstallBodySchema, statsInstallResponseSchema } from "@closet/contract";
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { createRecordInstallController } from "../controllers/stats/record-install.controller.js";

/**
 * Роут статистики установок.
 */
const statsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/stats/installs",
    {
      schema: {
        body: statsInstallBodySchema,
        response: {
          202: statsInstallResponseSchema,
          400: errorResponseSchema,
        },
      },
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "10 minutes",
        },
      },
    },
    createRecordInstallController(fastify.orm),
  );
};

export default statsRoutes;
