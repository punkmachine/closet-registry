import type { DataSource, EntityManager } from "typeorm";
import { LessThan } from "typeorm";
import { Session } from "../../db/entities/index.js";
import { isStale } from "./touch-throttle.js";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface NewSessionInput {
  userId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
}

/**
 * Создаёт сессию со сроком `SESSION_TTL_MS` от `now`.
 *
 * @param dataSource - источник данных
 * @param input - данные сессии
 * @param now - момент создания
 * @returns созданная сессия
 */
export async function createSession(
  dataSource: DataSource,
  input: NewSessionInput,
  now: Date = new Date(),
): Promise<Session> {
  const repo = dataSource.getRepository(Session);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const session = repo.create({
    user: { id: input.userId },
    tokenHash: input.tokenHash,
    expiresAt,
    lastUsedAt: now,
    userAgent: input.userAgent,
    ip: input.ip,
  });

  return await repo.save(session);
}

/**
 * Сессия по хешу токена вместе с пользователем. Срок действия и состояние юзера проверяет вызывающий.
 *
 * @param dataSource - источник данных
 * @param tokenHash - sha256 токена сессии
 * @returns сессия или `null`
 */
export async function findSessionByTokenHash(dataSource: DataSource, tokenHash: string): Promise<Session | null> {
  return await dataSource.getRepository(Session).findOne({ where: { tokenHash }, relations: { user: true } });
}

/**
 * Скользящее продление: сдвигает `expires_at` на `SESSION_TTL_MS` от `now`, но не чаще `TOUCH_THROTTLE_MS`.
 *
 * @param dataSource - источник данных
 * @param session - текущая сессия
 * @param now - текущее время
 * @returns `true`, если запись обновлена
 */
export async function touchSession(dataSource: DataSource, session: Session, now: Date = new Date()): Promise<boolean> {
  if (!isStale(session.lastUsedAt, now)) {
    return false;
  }

  await dataSource
    .getRepository(Session)
    .update({ id: session.id }, { lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) });

  return true;
}

/**
 * Удаляет одну сессию (выход).
 *
 * @param dataSource - источник данных
 * @param id - id сессии
 */
export async function deleteSession(dataSource: DataSource, id: string): Promise<void> {
  await dataSource.getRepository(Session).delete({ id });
}

/**
 * Удаляет сессии пользователя.
 *
 * @param manager - источник данных или менеджер транзакции
 * @param userId - id пользователя
 * @param exceptSessionId - сессия, которую оставить (смена пароля отзывает только чужие)
 */
export async function deleteUserSessions(
  manager: DataSource | EntityManager,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  const query = manager.getRepository(Session).createQueryBuilder().delete().where("user_id = :userId", { userId });

  if (exceptSessionId !== undefined) {
    query.andWhere("id <> :exceptSessionId", { exceptSessionId });
  }

  await query.execute();
}

/**
 * Удаляет просроченные сессии.
 *
 * @param dataSource - источник данных
 * @param now - текущее время
 * @returns сколько сессий удалено
 */
export async function deleteExpiredSessions(dataSource: DataSource, now: Date = new Date()): Promise<number> {
  const result = await dataSource.getRepository(Session).delete({ expiresAt: LessThan(now) });

  return result.affected ?? 0;
}
