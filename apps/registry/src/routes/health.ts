import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";

import { healthResponseSchema } from "../registry/schemas.js";

const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/health",
    { schema: { response: { 200: healthResponseSchema } } },
    async (request) => {
      try {
        await fastify.pg.query("SELECT 1");
        return { status: "ok" as const, db: "ok" as const };
      } catch (error) {
        request.log.error(error);
        return { status: "ok" as const, db: "error" as const };
      }
    },
  );
};

export default healthRoutes;
