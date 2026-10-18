import type { FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import { getAuth } from "./guards.js";
import { type AuditEntryInput, writeAuditEntry } from "./repository/audit.js";

export type AuditEvent = Pick<AuditEntryInput, "action" | "targetType" | "targetId" | "details">;

/**
 * Пишет запись аудита от имени аутентифицированного пользователя запроса.
 *
 * @remarks Сбой записи не валит запрос: операция к этому моменту уже выполнена, и `5xx` заставил бы клиента
 * повторить её (например, публикация дала бы `409`). Ошибка уходит в лог.
 *
 * @param orm - источник данных
 * @param request - аутентифицированный запрос
 * @param event - что произошло
 */
export async function recordAudit(
  orm: DataSource,
  request: Pick<FastifyRequest, "auth" | "ip" | "log">,
  event: AuditEvent,
): Promise<void> {
  const { user } = getAuth(request);

  await recordAuditAs(orm, request, { id: user.id, username: user.username }, event);
}

/**
 * Пишет запись аудита от имени произвольного актора — для входа, где `request.auth` ещё нет.
 *
 * @param orm - источник данных
 * @param request - запрос (нужны `ip` и логгер)
 * @param actor - актор; `id = null` для неизвестного логина
 * @param event - что произошло
 */
export async function recordAuditAs(
  orm: DataSource,
  request: Pick<FastifyRequest, "ip" | "log">,
  actor: { id: string | null; username: string },
  event: AuditEvent,
): Promise<void> {
  try {
    await writeAuditEntry(orm, { ...event, actorId: actor.id, actorUsername: actor.username, ip: request.ip });
  } catch (error) {
    request.log.error({ err: error, action: event.action }, "Failed to write audit entry");
  }
}
