import { z } from "zod";

import { PLUGIN_COMPONENTS, PLUGIN_FILE_AI_VALUES } from "./components.js";
import { semverSchema, slugSchema, versionOrLatestSchema } from "./identifiers.js";
import { MAX_CHANGELOG_LENGTH, MAX_DESCRIPTION_LENGTH } from "./limits.js";

export const pluginComponentSchema = z.enum(PLUGIN_COMPONENTS);
export const pluginFileAiSchema = z.enum(PLUGIN_FILE_AI_VALUES);

/** Метаданные файла без `content`: используются во входящем multipart-запросе и как база для ответа сервера. */
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
export type PluginFileInput = z.infer<typeof pluginFileInputSchema>;

/**
 * Метаданные файла в ответе сервера.
 *
 * @remarks
 * `mergeKeyPath` здесь `nullable`, а не `optional` как во входной схеме: в БД он nullable, а не «может отсутствовать».
 */
export const pluginFileMetadataSchema = pluginFileObjectSchema.extend({
  mergeKeyPath: z.string().min(1).nullable(),
  sha256: z.string(),
  sizeBytes: z.string(),
});
export type PluginFileMetadata = z.infer<typeof pluginFileMetadataSchema>;

export const pluginPublishMetadataSchema = z.object({
  slug: slugSchema,
  description: z.string().max(MAX_DESCRIPTION_LENGTH),
  version: semverSchema,
  changelog: z.string().max(MAX_CHANGELOG_LENGTH).optional(),
  dependencies: z.array(slugSchema).default([]),
  files: z.array(pluginFileInputSchema).min(1),
});
export type PluginPublishMetadata = z.infer<typeof pluginPublishMetadataSchema>;

export const pluginUpdateMetadataSchema = pluginPublishMetadataSchema.partial({
  slug: true,
  version: true,
});
export type PluginUpdateMetadata = z.infer<typeof pluginUpdateMetadataSchema>;

export const pluginVersionResponseSchema = z.object({
  slug: z.string(),
  description: z.string(),
  version: z.string(),
  changelog: z.string().nullable(),
  dependencies: z.array(z.string()),
  files: z.array(pluginFileMetadataSchema),
});
export type PluginVersionResponse = z.infer<typeof pluginVersionResponseSchema>;

export const pluginSlugParamsSchema = z.object({
  slug: slugSchema,
});

/** Params для PUT/DELETE версии: только точная semver-версия. */
export const pluginSlugVersionParamsSchema = z.object({
  slug: slugSchema,
  version: semverSchema,
});

/** Params для чтения bundle: допускает литерал `latest`. */
export const pluginBundleParamsSchema = z.object({
  slug: slugSchema,
  version: versionOrLatestSchema,
});

/**
 * Файл в bundle-ответе: единый эндпоинт чтения отдаёт содержимое всех файлов версии одним запросом.
 *
 * @remarks
 * `encoding` — эвристика на чтении (валидный UTF-8 без потерь → `utf8` строкой, иначе `base64`), в БД не хранится.
 */
export const pluginBundleFileSchema = pluginFileMetadataSchema.extend({
  encoding: z.enum(["utf8", "base64"]),
  content: z.string(),
});
export type PluginBundleFile = z.infer<typeof pluginBundleFileSchema>;

export const pluginBundleResponseSchema = z.object({
  slug: z.string(),
  description: z.string(),
  version: z.string(),
  changelog: z.string().nullable(),
  dependencies: z.array(z.string()),
  files: z.array(pluginBundleFileSchema),
});
export type PluginBundle = z.infer<typeof pluginBundleResponseSchema>;

/**
 * Элемент `GET /v1/plugins`: опубликованный плагин (не версия) — slug и последняя semver-версия.
 *
 * @remarks
 * Без пагинации в MVP: реестр self-hosted и небольшой, а добавить её можно без breaking change
 * (по умолчанию отдавать «первую страницу» целиком).
 */
export const pluginListItemSchema = z.object({
  slug: z.string(),
  description: z.string(),
  latestVersion: z.string(),
  updatedAt: z.string(),
});
export type PluginListItem = z.infer<typeof pluginListItemSchema>;

export const pluginListResponseSchema = z.object({
  plugins: z.array(pluginListItemSchema),
});
export type PluginListResponse = z.infer<typeof pluginListResponseSchema>;

/**
 * Элемент `GET /v1/plugins/:slug/versions`: версия плагина без содержимого файлов.
 *
 * @remarks
 * `closet-cli` этот эндпоинт не использует (ему достаточно `latest`), он нужен админке.
 */
export const pluginVersionListItemSchema = z.object({
  version: z.string(),
  changelog: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fileCount: z.number().int(),
});
export type PluginVersionListItem = z.infer<typeof pluginVersionListItemSchema>;

export const pluginVersionListResponseSchema = z.object({
  slug: z.string(),
  versions: z.array(pluginVersionListItemSchema),
});
export type PluginVersionListResponse = z.infer<typeof pluginVersionListResponseSchema>;
