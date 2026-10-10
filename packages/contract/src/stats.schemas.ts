import { z } from "zod";

import { semverSchema, slugSchema } from "./identifiers.js";

/**
 * Тело `POST /v1/stats/installs`: факт установки конкретной версии плагина и версия CLI, которая её установила.
 */
export const statsInstallBodySchema = z.object({
  slug: slugSchema,
  version: semverSchema,
  cliVersion: z.string().min(1),
});

/**
 * Ответ `POST /v1/stats/installs`: подтверждение записи события установки.
 */
export const statsInstallResponseSchema = z.object({ ok: z.literal(true) });

export type StatsInstallBody = z.infer<typeof statsInstallBodySchema>;
export type StatsInstallResponse = z.infer<typeof statsInstallResponseSchema>;
