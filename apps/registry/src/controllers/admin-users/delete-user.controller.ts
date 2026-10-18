import type { userIdParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { recordAudit } from "../../auth/record-audit.js";
import type { AdminUsersService } from "../../services/admin-users.service.js";

type DeleteUserRequest = FastifyRequest<{ Params: z.infer<typeof userIdParamsSchema> }>;

/**
 * Soft-delete пользователя: логин освобождается, плагины остаются с авторством.
 *
 * @remarks Нет пользователя -> `404`; последний активный admin -> `409`.
 */
export function createDeleteUserController(orm: DataSource, service: AdminUsersService) {
  return async function deleteUser(request: DeleteUserRequest, reply: FastifyReply): Promise<void> {
    const user = await service.remove(request.params.id);

    await recordAudit(orm, request, {
      action: "user.delete",
      targetType: "user",
      targetId: user.id,
      details: { username: user.username },
    });

    reply.code(204).send();
  };
}
