import { timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const adminAuthPluginImpl: FastifyPluginAsync = async (fastify) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error("ADMIN_TOKEN is not set");
  }
  const adminTokenBuffer = Buffer.from(adminToken);

  fastify.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : undefined;

    if (!token) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const tokenBuffer = Buffer.from(token);
    const isValid =
      tokenBuffer.length === adminTokenBuffer.length &&
      timingSafeEqual(tokenBuffer, adminTokenBuffer);

    if (!isValid) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
  });
};

export default fp(adminAuthPluginImpl);
