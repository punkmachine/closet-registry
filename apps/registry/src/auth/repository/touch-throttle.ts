export const TOUCH_THROTTLE_MS = 60 * 1000;

/**
 * Проверяет, пора ли снова обновлять `last_used_at` (и продлевать сессию).
 *
 * @param lastUsedAt - время прошлого использования или `null`, если запись ещё не использовали
 * @param now - текущее время
 * @returns `true`, если с прошлого обновления прошло не меньше `TOUCH_THROTTLE_MS`
 */
export function isStale(lastUsedAt: Date | null, now: Date): boolean {
  return lastUsedAt === null || now.getTime() - lastUsedAt.getTime() >= TOUCH_THROTTLE_MS;
}
