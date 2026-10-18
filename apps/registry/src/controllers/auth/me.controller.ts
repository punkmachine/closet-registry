import type { FastifyReply, FastifyRequest } from "fastify";
import { getAuth } from "../../auth/guards.js";
import { toUserDto } from "../../auth/user-dto.js";

/**
 * Текущий пользователь.
 */
export function createMeController() {
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify ждёт async-хендлер без done-колбэка
  return async function me(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.send({ user: toUserDto(getAuth(request).user) });
  };
}
