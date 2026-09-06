import rateLimit from "@fastify/rate-limit";
import fp from "fastify-plugin";

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: false,
  });
});
