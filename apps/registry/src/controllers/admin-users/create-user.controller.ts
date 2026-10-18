import type { NewUserBody } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { recordAudit } from "../../auth/record-audit.js";
import { toUserDto } from "../../auth/user-dto.js";
import type { AdminUsersService } from "../../services/admin-users.service.js";

type CreateUserRequest = FastifyRequest<{ Body: NewUserBody }>;

/**
 * Создаёт пользователя с временным паролем: при первом входе он обязан его сменить.
 *
 * @remarks Занятый логин -> `409`.
 */
export function createCreateUserController(orm: DataSource, service: AdminUsersService) {
  return async function createUser(request: CreateUserRequest, reply: FastifyReply): Promise<void> {
    const user = await service.create(request.body);

    await recordAudit(orm, request, {
      action: "user.create",
      targetType: "user",
      targetId: user.id,
      details: { username: user.username, role: user.role },
    });

    reply.code(201).send({ user: toUserDto(user) });
  };
}
