import type { DataSource, EntityManager } from "typeorm";
import { IsNull } from "typeorm";
import { ApiToken } from "../../db/entities/index.js";
import { generateApiToken, tokenDisplayPrefix } from "../tokens.js";
import { isStale } from "./touch-throttle.js";

/**
 * Активный (не отозванный) токен пользователя.
 *
 * @param dataSource - источник данных
 * @param userId - id пользователя
 * @returns токен или `null`
 */
export async function findActiveApiToken(dataSource: DataSource, userId: string): Promise<ApiToken | null> {
  return await dataSource.getRepository(ApiToken).findOne({ where: { user: { id: userId }, revokedAt: IsNull() } });
}

/**
 * Активный токен по хешу вместе с пользователем. Отозванные не возвращаются.
 *
 * @param dataSource - источник данных
 * @param tokenHash - sha256 токена
 * @returns токен или `null`
 */
export async function findActiveApiTokenByHash(dataSource: DataSource, tokenHash: string): Promise<ApiToken | null> {
  return await dataSource
    .getRepository(ApiToken)
    .findOne({ where: { tokenHash, revokedAt: IsNull() }, relations: { user: true } });
}

/**
 * Отзывает активный токен пользователя.
 *
 * @param manager - источник данных или менеджер транзакции
 * @param userId - id пользователя
 * @param now - момент отзыва
 * @returns `true`, если было что отзывать
 */
export async function revokeUserApiToken(
  manager: DataSource | EntityManager,
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await manager
    .getRepository(ApiToken)
    .createQueryBuilder()
    .update()
    .set({ revokedAt: now })
    .where("user_id = :userId AND revoked_at IS NULL", { userId })
    .execute();

  return (result.affected ?? 0) > 0;
}

/**
 * Выпускает токен, отзывая прежний в той же транзакции (частичный уникальный индекс допускает один активный).
 *
 * @param dataSource - источник данных
 * @param userId - id пользователя
 * @param now - момент выпуска
 * @returns запись и полное значение токена — его больше не получить
 */
export async function issueApiToken(
  dataSource: DataSource,
  userId: string,
  now: Date = new Date(),
): Promise<{ token: ApiToken; value: string }> {
  const generated = generateApiToken();

  const token = await dataSource.transaction(async (manager) => {
    await revokeUserApiToken(manager, userId, now);

    const repo = manager.getRepository(ApiToken);

    return await repo.save(
      repo.create({ user: { id: userId }, tokenHash: generated.hash, prefix: tokenDisplayPrefix(generated.value) }),
    );
  });

  return { token, value: generated.value };
}

/**
 * Обновляет `last_used_at` токена, но не чаще `TOUCH_THROTTLE_MS`.
 *
 * @param dataSource - источник данных
 * @param token - использованный токен
 * @param now - текущее время
 * @returns `true`, если запись обновлена
 */
export async function touchApiToken(dataSource: DataSource, token: ApiToken, now: Date = new Date()): Promise<boolean> {
  if (!isStale(token.lastUsedAt, now)) {
    return false;
  }

  await dataSource.getRepository(ApiToken).update({ id: token.id }, { lastUsedAt: now });

  return true;
}
