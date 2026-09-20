import fp from "fastify-plugin";
import { Pool } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    pg: Pool;
  }
}

export default fp(async (fastify) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({ connectionString });

  fastify.decorate("pg", pool);

  fastify.addHook("onClose", async () => {
    await pool.end();
  });
});
