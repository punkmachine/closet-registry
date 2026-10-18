import type { ResetPasswordBody, userIdParamsSchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { recordAudit } from "../../auth/record-audit.js";
import type { AdminUsersService } from "../../services/admin-users.service.js";

type ResetPasswordRequest = FastifyRequest<{ Params: z.infer<typeof userIdParamsSchema>; Body: ResetPasswordBody }>;

/**
 * Сбрасывает пароль на временный: `must_change_password = true`, все сессии и токен пользователя отзываются.
 */
export function createResetPasswordController(orm: DataSource, service: AdminUsersService) {
  return async function resetPassword(request: ResetPasswordRequest, reply: FastifyReply): Promise<void> {
    const user = await service.resetPassword(request.params.id, request.body.password);

    await recordAudit(orm, request, {
      action: "user.reset_password",
      targetType: "user",
      targetId: user.id,
      details: { username: user.username },
    });

    reply.code(204).send();
  };
}
