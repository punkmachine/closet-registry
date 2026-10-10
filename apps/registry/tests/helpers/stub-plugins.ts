/**
 * Заглушки fastify-плагинов `src/plugins/postgres.ts` и `src/plugins/typeorm.ts` для API-тестов.
 * Не создают Pool, не инициализируют AppDataSource и не читают DATABASE_URL — сети нет вообще.
 * Подставляются через vi.mock в `tests/setup/mock-db.ts`.
 */
import fp from "fastify-plugin";
import type { Pool } from "pg";
import type { DataSource } from "typeorm";
import { fakeDb } from "./fake-db.js";

/** Декорирует `fastify.pg`: `query` отвечает как успешный `SELECT 1`, либо падает, если `fakeDb.setHealthy(false)`. */
export const stubPostgresPlugin = fp(async (fastify) => {
  const pool = {
    query: async () => {
      if (!fakeDb.isHealthy()) {
        throw new Error("fake db is unhealthy");
      }
      return { rows: [{ "?column?": 1 }], rowCount: 1 };
    },
    end: () => Promise.resolve(),
  };
  fastify.decorate("pg", pool as unknown as Pool);
});

/**
 * Декорирует `fastify.orm` пустым объектом: роуты лишь передают его первым аргументом в функции репозитория,
 * а те (fake) его игнорируют. Любое реальное обращение к нему — ошибка теста, поэтому он бросает через Proxy.
 */
export const stubTypeormPlugin = fp(async (fastify) => {
  const orm = new Proxy(
    {},
    {
      get(_target, property) {
        // fastify.decorate проверяет у значения `getter`/`setter`, это не обращение к БД
        if (typeof property === "symbol" || property === "getter" || property === "setter") {
          return Reflect.get(_target, property) as unknown;
        }
        throw new Error(`fastify.orm.${property} недоступен в API-тестах: используйте fakeDb`);
      },
    },
  ) as DataSource;
  fastify.decorate("orm", orm);
});
