import type { DataSource } from "typeorm";
import { revokeUserApiToken } from "./api-tokens.js";
import { deleteUserSessions } from "./sessions.js";

/**
 * Отзывает все сессии и токен пользователя: при блокировке, удалении, смене роли и сбросе пароля.
 *
 * @param dataSource - источник данных
 * @param userId - id пользователя
 * @param now - момент отзыва
 */
export async function revokeAllCredentials(
  dataSource: DataSource,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await deleteUserSessions(manager, userId);
    await revokeUserApiToken(manager, userId, now);
  });
}
