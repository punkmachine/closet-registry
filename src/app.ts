import cors from "@fastify/cors";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from "@fastify/type-provider-zod";
import Fastify from "fastify";
import type { FastifyError } from "fastify";

import adminAuthPlugin from "./plugins/admin-auth.js";
import multipartPlugin from "./plugins/multipart.js";
import postgresPlugin from "./plugins/postgres.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import adminItemsRoutes from "./routes/admin-items.js";
import healthRoutes from "./routes/health.js";
import itemsRoutes from "./routes/items.js";
import statsRoutes from "./routes/stats.js";

export async function buildApp() {
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "production"
        ? true
        : { transport: { target: "pino-pretty" } },
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      reply.code(400).send({ error: `Validation error: ${error.message}` });
      return;
    }

    if (isResponseSerializationError(error)) {
      request.log.error(error);
      reply.code(500).send({ error: "Internal Server Error" });
      return;
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error);
    }
    reply.code(statusCode).send({ error: error.message });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: "Not Found" });
  });

  await app.register(cors, { origin: true });

  await app.register(postgresPlugin);
  await app.register(rateLimitPlugin);

  await app.register(healthRoutes);
  await app.register(itemsRoutes, { prefix: "/v1" });
  await app.register(statsRoutes, { prefix: "/v1" });

  await app.register(
    async (adminScope) => {
      await adminScope.register(adminAuthPlugin);
      await adminScope.register(multipartPlugin);
      await adminScope.register(adminItemsRoutes);
    },
    { prefix: "/v1/admin" },
  );

  return app;
}
