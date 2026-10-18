import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { listActiveUsers } from "../../auth/repository/users.js";
import { toUserDto } from "../../auth/user-dto.js";

/**
 * Список не удалённых пользователей.
 */
export function createListUsersController(orm: DataSource) {
  return async function listUsers(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const users = await listActiveUsers(orm);

    reply.send({ users: users.map((user) => toUserDto(user)) });
  };
}
