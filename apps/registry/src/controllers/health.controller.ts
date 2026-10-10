import type { FastifyRequest } from "fastify";
import type { Pool } from "pg";

/**
 * Проверка живости сервиса и доступности БД.
 *
 * @remarks Использует сырой `pg.Pool` (`fastify.pg`), а не TypeORM: дешёвый `SELECT 1`,
 * не зависящий от жизненного цикла `AppDataSource`. При недоступной БД отвечает 200 с `db: "error"`.
 */
export function createHealthController(pool: Pool) {
  return async function health(request: FastifyRequest): Promise<{ status: "ok"; db: "ok" | "error" }> {
    try {
      await pool.query("SELECT 1");

      return { status: "ok" as const, db: "ok" as const };
    } catch (error) {
      request.log.error(error);

      return { status: "ok" as const, db: "error" as const };
    }
  };
}
