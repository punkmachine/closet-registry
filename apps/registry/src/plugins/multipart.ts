import multipart from "@fastify/multipart";
import fp from "fastify-plugin";

export default fp(async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB на файл
      files: 200,
    },
  });
});
