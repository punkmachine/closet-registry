import { z } from "zod";

export const errorResponseSchema = z.object({ error: z.string() });

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.enum(["ok", "error"]),
});

export const statsInstallBodySchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
  cliVersion: z.string().min(1),
});

export const statsInstallResponseSchema = z.object({ ok: z.literal(true) });
