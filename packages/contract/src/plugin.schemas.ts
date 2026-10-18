import { z } from "zod";

import { authorRefSchema } from "./auth.schemas.js";
import { PLUGIN_COMPONENTS, PLUGIN_FILE_AI_VALUES } from "./components.js";
import { semverSchema, slugSchema, versionOrLatestSchema } from "./identifiers.js";
import { MAX_CHANGELOG_LENGTH, MAX_DESCRIPTION_LENGTH } from "./limits.js";

/**
 * Компонент плагина (`mcp`/`rules`/`hooks`/`agents`/`commands`/`skills`/`scripts`), к которому относится файл.
 */
export const pluginComponentSchema = z.enum(PLUGIN_COMPONENTS);

/**
 * ИИ, для которого предназначен файл (`codex`/`claude-code`); `null` в схемах файла означает общий файл.
 */
export const pluginFileAiSchema = z.enum(PLUGIN_FILE_AI_VALUES);

/**
 * Метаданные файла без `content`: используются во входящем multipart-запросе и как база для ответа сервера.
 */
const pluginFileObjectSchema = z.object({
  component: pluginComponentSchema,
  ai: pluginFileAiSchema.nullable().default(null),
  relativePath: z.string().min(1),
  rootPath: z.boolean().optional().default(false),
  merge: z.boolean().optional().default(false),
  mergeKeyPath: z.string().min(1).optional(),
  template: z.boolean().optional().default(false),
});

/**
 * Метаданные файла во входящем запросе публикации/обновления версии.
 * Дополнительно требует `mergeKeyPath` для файлов с `merge: true`.
 */
export const pluginFileInputSchema = pluginFileObjectSchema.refine(
  (file) => !file.merge || file.mergeKeyPath !== undefined,
  { message: "merge files must specify mergeKeyPath", path: ["mergeKeyPath"] },
);

/**
 * Метаданные файла в ответе сервера.
 */
export const pluginFileMetadataSchema = pluginFileObjectSchema.extend({
  mergeKeyPath: z.string().min(1).nullable(),
  sha256: z.string(),
  sizeBytes: z.string(),
});

/**
 * Метаданные публикации новой версии плагина (JSON-часть multipart-запроса `POST`): slug, описание,
 * версия, changelog, зависимости и список файлов.
 */
export const pluginPublishMetadataSchema = z.object({
  slug: slugSchema,
  description: z.string().max(MAX_DESCRIPTION_LENGTH),
  version: semverSchema,
  changelog: z.string().max(MAX_CHANGELOG_LENGTH).optional(),
  dependencies: z.array(slugSchema).default([]),
  files: z.array(pluginFileInputSchema).min(1),
});

/**
 * Метаданные обновления версии плагина (`PUT`): те же поля, что при публикации, но `slug` и `version`
 * необязательны, так как берутся из params.
 */
export const pluginUpdateMetadataSchema = pluginPublishMetadataSchema.partial({
  slug: true,
  version: true,
});

/**
 * Ответ с метаданными версии плагина: описание, зависимости и метаданные файлов без их содержимого.
 */
export const pluginVersionResponseSchema = z.object({
  slug: z.string(),
  description: z.string(),
  version: z.string(),
  changelog: z.string().nullable(),
  createdBy: authorRefSchema,
  updatedBy: authorRefSchema,
  dependencies: z.array(z.string()),
  files: z.array(pluginFileMetadataSchema),
});

/**
 * Params маршрутов, адресующих плагин целиком: только `slug`.
 */
export const pluginSlugParamsSchema = z.object({
  slug: slugSchema,
});

/**
 * Params для PUT/DELETE версии: только точная semver-версия.
 */
export const pluginSlugVersionParamsSchema = z.object({
  slug: slugSchema,
  version: semverSchema,
});

/**
 * Params для чтения bundle: допускает литерал `latest`.
 */
export const pluginBundleParamsSchema = z.object({
  slug: slugSchema,
  version: versionOrLatestSchema,
});

/**
 * Файл в bundle-ответе: единый эндпоинт чтения отдаёт содержимое всех файлов версии одним запросом.
 */
export const pluginBundleFileSchema = pluginFileMetadataSchema.extend({
  encoding: z.enum(["utf8", "base64"]),
  content: z.string(),
});

/**
 * Bundle-ответ `GET /v1/plugins/:slug/:version`: метаданные версии вместе с содержимым всех её файлов.
 */
export const pluginBundleResponseSchema = z.object({
  slug: z.string(),
  description: z.string(),
  version: z.string(),
  changelog: z.string().nullable(),
  createdBy: authorRefSchema,
  updatedBy: authorRefSchema,
  dependencies: z.array(z.string()),
  files: z.array(pluginBundleFileSchema),
});

/**
 * Элемент `GET /v1/plugins`: опубликованный плагин (не версия) — slug и последняя semver-версия.
 */
export const pluginListItemSchema = z.object({
  slug: z.string(),
  description: z.string(),
  latestVersion: z.string(),
  createdBy: authorRefSchema,
  updatedBy: authorRefSchema,
  updatedAt: z.string(),
});

/**
 * Ответ `GET /v1/plugins`: список всех опубликованных плагинов.
 */
export const pluginListResponseSchema = z.object({
  plugins: z.array(pluginListItemSchema),
});

/**
 * Элемент `GET /v1/plugins/:slug/versions`: версия плагина без содержимого файлов.
 */
export const pluginVersionListItemSchema = z.object({
  version: z.string(),
  changelog: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fileCount: z.number().int(),
  createdBy: authorRefSchema,
  updatedBy: authorRefSchema,
});

/**
 * Ответ `GET /v1/plugins/:slug/versions`: список версий плагина.
 */
export const pluginVersionListResponseSchema = z.object({
  slug: z.string(),
  versions: z.array(pluginVersionListItemSchema),
});

export type PluginFileInput = z.infer<typeof pluginFileInputSchema>;
export type PluginFileMetadata = z.infer<typeof pluginFileMetadataSchema>;
export type PluginPublishMetadata = z.infer<typeof pluginPublishMetadataSchema>;
export type PluginUpdateMetadata = z.infer<typeof pluginUpdateMetadataSchema>;
export type PluginVersionResponse = z.infer<typeof pluginVersionResponseSchema>;
export type PluginBundleFile = z.infer<typeof pluginBundleFileSchema>;
export type PluginBundle = z.infer<typeof pluginBundleResponseSchema>;
export type PluginListItem = z.infer<typeof pluginListItemSchema>;
export type PluginListResponse = z.infer<typeof pluginListResponseSchema>;
export type PluginVersionListItem = z.infer<typeof pluginVersionListItemSchema>;
export type PluginVersionListResponse = z.infer<typeof pluginVersionListResponseSchema>;
