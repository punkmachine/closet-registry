/**
 * Хелперы данных API-тестов. БД в API-тестах не используется: слой данных — in-memory `fakeDb`
 * (см. fake-db.ts, подмена модулей — tests/setup/mock-db.ts).
 *
 * Использование:
 *   beforeEach(async () => { ctx = await buildTestApp(); resetDatabase(); });
 *   const slug = uniqueSlug("demo");
 *
 * Проверки состояния — через `ctx.db` (getPlugins/getVersions/getFiles/installEventsCount).
 */
import { randomBytes } from "node:crypto";
import { fakeDb } from "./fake-db.js";

/**
 * Сбрасывает in-memory состояние fake. Имя оставлено для совместимости с прежним `resetDatabase()`; к БД обращений нет.
 */
export function resetDatabase(): Promise<void> {
  fakeDb.reset();
  return Promise.resolve();
}

let slugCounter = 0;

/** Уникальный валидный slug (lowercase, цифры, дефисы): `<prefix>-<n>-<rand>`. */
export function uniqueSlug(prefix = "plugin"): string {
  slugCounter += 1;
  return `${prefix}-${slugCounter}-${randomBytes(3).toString("hex")}`;
}
