import type { DataSource } from "typeorm";
import { AuditLog } from "../../db/entities/index.js";

export interface AuditEntryInput {
  actorId: string | null;
  actorUsername: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ip?: string | null;
}

export interface AuditListOptions {
  limit: number;
  before?: string;
}

/**
 * Добавляет запись в журнал аудита.
 *
 * @param dataSource - источник данных
 * @param entry - данные записи
 */
export async function writeAuditEntry(dataSource: DataSource, entry: AuditEntryInput): Promise<void> {
  const repo = dataSource.getRepository(AuditLog);

  await repo.save(
    repo.create({
      actorId: entry.actorId,
      actorUsername: entry.actorUsername,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      details: entry.details ?? null,
      ip: entry.ip ?? null,
    }),
  );
}

/**
 * Записи аудита от новых к старым.
 *
 * @param dataSource - источник данных
 * @param options - лимит и курсор
 * @returns записи
 */
export async function listAuditEntries(dataSource: DataSource, options: AuditListOptions): Promise<AuditLog[]> {
  const query = dataSource
    .getRepository(AuditLog)
    .createQueryBuilder("audit")
    .orderBy("audit.id", "DESC")
    .limit(options.limit);

  if (options.before !== undefined) {
    query.where("audit.id < :before", { before: options.before });
  }

  return await query.getMany();
}
