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
import typeormPlugin from "./plugins/typeorm.js";
import adminPluginsRoutes from "./routes/admin-plugins.js";
import healthRoutes from "./routes/health.js";
import pluginsRoutes from "./routes/plugins.js";
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
  await app.register(typeormPlugin);
  await app.register(rateLimitPlugin);

  await app.register(healthRoutes);

  await app.register(
    async (v1Scope) => {
      // Один статический токен на self-hosted-инстанс проверяется на ВСЕХ /v1/* эндпоинтах, включая
      // публичное чтение, а не только admin/write — поэтому auth регистрируется
      // прямо в v1Scope, а не только во вложенном /v1/admin. adminAuthPlugin обёрнут в fp(), поэтому его
      // onRequest-хук поднимается ровно до v1Scope и оттуда наследуется всеми дочерними register()-вызовами
      // ниже, включая statsRoutes/pluginsRoutes и вложенный adminScope.
      await v1Scope.register(adminAuthPlugin);

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

  return app;
}
