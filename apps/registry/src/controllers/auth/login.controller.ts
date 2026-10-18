import type { LoginBody } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { recordAuditAs } from "../../auth/record-audit.js";
import { toUserDto } from "../../auth/user-dto.js";
import type { AuthService } from "../../services/auth.service.js";

type LoginRequest = FastifyRequest<{ Body: LoginBody }>;

/**
 * Вход по логину и паролю: выдаёт токен сессии `cls_…`.
 *
 * @remarks Ошибки (`401`, `403 account_locked` / `account_disabled`) бросает сервис, статусы и `Retry-After`
 * выставляет глобальный `setErrorHandler`.
 */
export function createLoginController(orm: DataSource, service: AuthService) {
  return async function login(request: LoginRequest, reply: FastifyReply): Promise<void> {
    const result = await service.login(request.body, {
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      audit: async (actor, event) => {
        await recordAuditAs(orm, request, actor, event);
      },
    });

    reply.send({ token: result.token, expiresAt: result.expiresAt.toISOString(), user: toUserDto(result.user) });
  };
}
