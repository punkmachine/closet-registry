import cors from "@fastify/cors";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
  serializerCompiler,
  validatorCompiler,
} from "@fastify/type-provider-zod";
import type { FastifyError, FastifyInstance } from "fastify";
import Fastify from "fastify";

import { HttpError } from "./errors/http-error.js";
import authPlugin from "./plugins/auth.js";
import multipartPlugin from "./plugins/multipart.js";
import postgresPlugin from "./plugins/postgres.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import typeormPlugin from "./plugins/typeorm.js";
import { PathTraversalError } from "./registry/file-store.js";
import { PluginVersionConflictError } from "./registry/plugins-repository.js";
import adminPluginsRoutes from "./routes/admin-plugins.js";
import authRoutes from "./routes/auth.js";
import healthRoutes from "./routes/health.js";
import pluginsRoutes from "./routes/plugins.js";
import statsRoutes from "./routes/stats.js";

/**
 *
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === "production" ? true : { transport: { target: "pino-pretty" } },
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

    if (error instanceof PathTraversalError) {
      reply.code(400).send({ error: error.message });
      return;
    }

    if (error instanceof HttpError) {
      if (error.headers) {
        reply.headers(error.headers);
      }

      reply
        .code(error.statusCode)
        .send(
          error.errorCode === undefined ? { error: error.message } : { error: error.message, code: error.errorCode },
        );
      return;
    }

    if (error instanceof PluginVersionConflictError) {
      reply.code(409).send({ error: error.message });
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
  await app.register(typeormPlugin);
  await app.register(rateLimitPlugin);

  await app.register(healthRoutes);

  await app.register(
    async (v1Scope) => {
      await v1Scope.register(authPlugin);

      await v1Scope.register(authRoutes);
      await v1Scope.register(statsRoutes);
      await v1Scope.register(pluginsRoutes);

      await v1Scope.register(
        async (adminScope) => {
          await adminScope.register(multipartPlugin);
          await adminScope.register(adminPluginsRoutes);
        },
        { prefix: "/admin" },
      );
    },
    { prefix: "/v1" },
  );

  return await app;
}
