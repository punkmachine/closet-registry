import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";

import { recordInstall } from "../db/stats-repository.js";
import { findActiveVersionBySlugAndVersion } from "../registry/plugins-repository.js";
import { errorResponseSchema, statsInstallBodySchema, statsInstallResponseSchema } from "../registry/schemas.js";

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
    async (request, reply) => {
      const { slug, version, cliVersion } = request.body;
      const pluginVersion = await findActiveVersionBySlugAndVersion(fastify.orm, slug, version);

      if (!pluginVersion) {
        reply.code(400).send({ error: `Unknown plugin ${slug}@${version}` });
        return;
      }

      await recordInstall(fastify.orm, pluginVersion.plugin.id, pluginVersion.id, cliVersion);
      reply.code(202).send({ ok: true });
    },
  );
};

export default statsRoutes;
