import type { PatchUserBody, userIdParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { getAuth } from "../../auth/guards.js";
import { recordAudit } from "../../auth/record-audit.js";
import { toUserDto } from "../../auth/user-dto.js";
import type { AdminUsersService } from "../../services/admin-users.service.js";

type PatchUserRequest = FastifyRequest<{ Params: z.infer<typeof userIdParamsSchema>; Body: PatchUserBody }>;

/**
 * Меняет роль, блокировку или снимает временную блокировку входа.
 *
 * @remarks Нет пользователя -> `404`; последний активный admin -> `409`; своя роль -> `403`.
 */
export function createPatchUserController(orm: DataSource, service: AdminUsersService) {
  return async function patchUser(request: PatchUserRequest, reply: FastifyReply): Promise<void> {
    const { user, changes } = await service.patch(getAuth(request), request.params.id, request.body);

    await recordAudit(orm, request, {
      action: "user.update",
      targetType: "user",
      targetId: user.id,
      details: { username: user.username, ...changes },
    });

    reply.send({ user: toUserDto(user) });
  };
}
