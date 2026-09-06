import fp from "fastify-plugin";
import type { DataSource } from "typeorm";
import { AppDataSource } from "../db/data-source.js";

declare module "fastify" {
  interface FastifyInstance {
    orm: DataSource;
  }
}

export default fp(async (fastify) => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  fastify.decorate("orm", AppDataSource);

  fastify.addHook("onClose", async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
});
