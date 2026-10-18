import { healthResponseSchema } from "@closet/contract";
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";
import { createHealthController } from "../controllers/health.controller.js";

/**
 * Роут проверки живости сервиса.
 */
const healthRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get("/health", { schema: { response: { 200: healthResponseSchema } } }, createHealthController(fastify.pg));
};

export default healthRoutes;
