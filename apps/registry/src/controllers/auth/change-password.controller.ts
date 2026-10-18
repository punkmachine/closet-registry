import type { ChangePasswordBody } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { getAuth } from "../../auth/guards.js";
import { recordAudit } from "../../auth/record-audit.js";
import type { AuthService } from "../../services/auth.service.js";

type ChangePasswordRequest = FastifyRequest<{ Body: ChangePasswordBody }>;

/**
 * Смена своего пароля: сбрасывает `must_change_password` и отзывает все остальные сессии.
 */
export function createChangePasswordController(orm: DataSource, service: AuthService) {
  return async function changePassword(request: ChangePasswordRequest, reply: FastifyReply): Promise<void> {
    await service.changePassword(getAuth(request), request.body);
    await recordAudit(orm, request, { action: "auth.password_changed" });

    reply.code(204).send();
  };
}
