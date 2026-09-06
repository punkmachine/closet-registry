import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod";

import { recordInstall } from "../db/stats-repository.js";
import { getItemVersion } from "../registry/items-repository.js";
import {
  errorResponseSchema,
  statsInstallBodySchema,
  statsInstallResponseSchema,
} from "../registry/schemas.js";

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
      const { name, version } = request.body;
      const item = await getItemVersion(fastify.pg, name, version);

      if (!item) {
        reply.code(400).send({ error: `Unknown item ${name}@${version}` });
        return;
      }

      await recordInstall(fastify.pg, item.name, item.type, item.version);
      reply.code(202).send({ ok: true });
    },
  );
};

export default statsRoutes;
