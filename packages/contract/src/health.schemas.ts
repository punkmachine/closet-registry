import { z } from "zod";

/**
 * Ответ `GET /health`: статус сервиса и состояние подключения к БД.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.enum(["ok", "error"]),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
