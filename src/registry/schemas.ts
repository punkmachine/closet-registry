import semver from "semver";
import { z } from "zod";
import { ITEM_TYPES } from "./types.js";

export const itemTypeSchema = z.enum(ITEM_TYPES);

const semverStringSchema = z
  .string()
  .min(1)
  .refine((value) => semver.valid(value) !== null, {
    message: "must be a valid semver string",
  });

export const itemFileSchema = z.object({
  path: z.string().min(1),
  rootPath: z.boolean().optional(),
  merge: z.boolean().optional(),
  template: z.boolean().optional(),
});

export const itemFileContentSchema = itemFileSchema.extend({
  content: z.string(),
});

export const itemMetadataSchema = z.object({
  name: z.string().min(1),
  type: itemTypeSchema,
  version: semverStringSchema,
  description: z.string(),
  dependencies: z.array(z.string()),
  files: z.array(itemFileSchema),
});

export const itemMetadataListSchema = z.array(itemMetadataSchema);

export const itemFileContentListSchema = z.array(itemFileContentSchema);

export const itemCreateMetadataSchema = itemMetadataSchema.extend({
  files: z.array(itemFileSchema).min(1),
});

export const itemUpdateMetadataSchema = itemCreateMetadataSchema.partial({
  name: true,
  version: true,
});

export const itemNameParamsSchema = z.object({
  name: z.string().min(1),
});

export const itemNameVersionParamsSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

export const errorResponseSchema = z.object({ error: z.string() });

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  db: z.enum(["ok", "error"]),
});

export const statsInstallBodySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
});

export const statsInstallResponseSchema = z.object({ ok: z.literal(true) });
