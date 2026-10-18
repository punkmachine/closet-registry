import { z } from "zod";

/**
 * Тело ответа с ошибкой: единый формат для всех не-2xx ответов API. `code` — машинный код причины там, где клиенту
 * нужно различать случаи одного статуса (`account_locked`, `account_disabled`, `password_change_required`).
 */
export const errorResponseSchema = z.object({ error: z.string(), code: z.string().optional() });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
