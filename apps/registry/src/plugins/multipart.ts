import { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_VERSION } from "@closet/contract";
import multipart from "@fastify/multipart";
import fp from "fastify-plugin";

export default fp(async (fastify) => {
  await fastify.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: MAX_FILES_PER_VERSION,
    },
  });
});
