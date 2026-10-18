import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { getAuth } from "../../auth/guards.js";
import { recordAudit } from "../../auth/record-audit.js";
import { findActiveApiToken, issueApiToken, revokeUserApiToken } from "../../auth/repository/api-tokens.js";
import { toApiTokenDto } from "../../auth/user-dto.js";

/**
 * Метаданные своего активного API-токена или `{ token: null }`.
 */
export function createGetTokenController(orm: DataSource) {
  return async function getToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = await findActiveApiToken(orm, getAuth(request).user.id);

    reply.send({ token: token ? toApiTokenDto(token) : null });
  };
}

/**
 * Выпускает (или перевыпускает, отзывая прежний) свой API-токен. Полное значение — только в этом ответе.
 */
export function createIssueTokenController(orm: DataSource) {
  return async function issueToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { token, value } = await issueApiToken(orm, getAuth(request).user.id);

    await recordAudit(orm, request, { action: "auth.token_issued", details: { prefix: token.prefix } });

    reply.code(201).send({ ...toApiTokenDto(token), value });
  };
}

/**
 * Отзывает свой API-токен. Идемпотентно: отсутствие активного токена — тоже `204`.
 */
export function createRevokeTokenController(orm: DataSource) {
  return async function revokeToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (await revokeUserApiToken(orm, getAuth(request).user.id)) {
      await recordAudit(orm, request, { action: "auth.token_revoked" });
    }

    reply.code(204).send();
  };
}
