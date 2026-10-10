import { z } from "zod";

/**
 * Тело ответа с ошибкой: единый формат для всех не-2xx ответов API.
 */
export const errorResponseSchema = z.object({ error: z.string() });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
