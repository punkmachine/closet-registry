import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { getAuth } from "../../auth/guards.js";
import { recordAudit } from "../../auth/record-audit.js";
import { deleteSession } from "../../auth/repository/sessions.js";

/**
 * Выход: удаляет текущую сессию.
 *
 * @remarks Запрос с API-токеном ничего не отзывает (токен отзывается только через `DELETE /v1/auth/token`),
 * но отвечает `204`: выход идемпотентен.
 */
export function createLogoutController(orm: DataSource) {
  return async function logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const auth = getAuth(request);

    if (auth.kind === "session") {
      await deleteSession(orm, auth.credentialId);
      await recordAudit(orm, request, { action: "auth.logout" });
    }

    reply.code(204).send();
  };
}
