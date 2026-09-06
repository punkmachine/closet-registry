import semver from "semver";
import { z } from "zod";
import { PLUGIN_COMPONENTS, PLUGIN_FILE_AI_VALUES } from "../db/entities/plugin-file.entity.js";

export const pluginComponentSchema = z.enum(PLUGIN_COMPONENTS);
export const pluginFileAiSchema = z.enum(PLUGIN_FILE_AI_VALUES);

const semverStringSchema = z
  .string()
  .min(1)
  .refine((value) => semver.valid(value) !== null, {
    message: "must be a valid semver string",
  });

// Без content — используется и для входящего multipart-запроса (метаданные файла),
// и как база для ответа сервера (расширяется sha256/sizeBytes ниже).
const pluginFileObjectSchema = z.object({
  component: pluginComponentSchema,
  ai: pluginFileAiSchema.nullable().default(null),
  relativePath: z.string().min(1),
  rootPath: z.boolean().optional().default(false),
  merge: z.boolean().optional().default(false),
  mergeKeyPath: z.string().min(1).optional(),
  template: z.boolean().optional().default(false),
});

export const pluginFileInputSchema = pluginFileObjectSchema.refine(
  (file) => !file.merge || file.mergeKeyPath !== undefined,
  { message: "merge files must specify mergeKeyPath", path: ["mergeKeyPath"] },
);

export const pluginFileMetadataSchema = pluginFileObjectSchema.extend({
  // В ответе сервера mergeKeyPath приходит из БД, где он nullable (не "может отсутствовать" как во входной схеме).
  mergeKeyPath: z.string().min(1).nullable(),
  sha256: z.string(),
  sizeBytes: z.string(),
});

export const pluginPublishMetadataSchema = z.object({
  slug: z.string().min(1),
  description: z.string(),
  version: semverStringSchema,
  changelog: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  files: z.array(pluginFileInputSchema).min(1),
});

export const pluginUpdateMetadataSchema = pluginPublishMetadataSchema.partial({
  slug: true,
  version: true,
});

export const pluginVersionResponseSchema = z.object({
  slug: z.string(),
  description: z.string(),
  version: z.string(),
  changelog: z.string().nullable(),
  dependencies: z.array(z.string()),
  files: z.array(pluginFileMetadataSchema),
});

export const pluginSlugParamsSchema = z.object({
  slug: z.string().min(1),
});

export const pluginSlugVersionParamsSchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
});

// Единый bundle-эндпоинт чтения: один запрос отдаёт содержимое всех файлов версии сразу.
// encoding — эвристика на чтении (валидный UTF-8 без потерь -> "utf8" строкой, иначе "base64"), в БД не хранится.
export const pluginBundleFileSchema = pluginFileMetadataSchema.extend({
  encoding: z.enum(["utf8", "base64"]),
  content: z.string(),
});

export const pluginBundleResponseSchema = z.object({
  slug: z.string(),
  description: z.string(),
  version: z.string(),
  changelog: z.string().nullable(),
  dependencies: z.array(z.string()),
  files: z.array(pluginBundleFileSchema),
});
