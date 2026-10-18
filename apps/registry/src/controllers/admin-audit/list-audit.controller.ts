import type { auditQuerySchema } from "@closet/contract";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { listAuditEntries } from "../../auth/repository/audit.js";

type ListAuditRequest = FastifyRequest<{ Querystring: z.infer<typeof auditQuerySchema> }>;

/**
 * Журнал аудита от новых записей к старым; следующая страница — `before` = id последней записи.
 */
export function createListAuditController(orm: DataSource) {
  return async function listAudit(request: ListAuditRequest, reply: FastifyReply): Promise<void> {
    const entries = await listAuditEntries(orm, request.query);

    reply.send({
      entries: entries.map((entry) => ({
        id: entry.id,
        actorId: entry.actorId,
        actorUsername: entry.actorUsername,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: entry.details,
        ip: entry.ip,
        createdAt: entry.createdAt.toISOString(),
      })),
    });
  };
}
