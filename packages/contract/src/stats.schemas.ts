import { z } from "zod";

import { semverSchema, slugSchema } from "./identifiers.js";

export const statsInstallBodySchema = z.object({
  slug: slugSchema,
  version: semverSchema,
  cliVersion: z.string().min(1),
});
export type StatsInstallBody = z.infer<typeof statsInstallBodySchema>;

export const statsInstallResponseSchema = z.object({ ok: z.literal(true) });
export type StatsInstallResponse = z.infer<typeof statsInstallResponseSchema>;
