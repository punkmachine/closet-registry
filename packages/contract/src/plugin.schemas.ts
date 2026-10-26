import { z } from "zod";

import { authorRefSchema } from "./auth.schemas.js";
import { PLUGIN_COMPONENTS, PLUGIN_FILE_AI_VALUES, PLUGIN_FILE_FORMATS } from "./components.js";
import { HARNESS_IDS, isHarnessSupported, isSpecComponent } from "./harnesses.js";
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
 * Формат хранимого файла: `raw` — готовый файл как есть, `spec` — нейтральный источник
 * (Markdown + frontmatter), из которого реестр при выдаче bundle генерирует файлы под каждый harness.
 */
export const pluginFileFormatSchema = z.enum(PLUGIN_FILE_FORMATS);

/**
 * Идентификатор harness'а (`claude-code`/`codex`).
 */
export const harnessIdSchema = z.enum(HARNESS_IDS);

/**
 * Общие поля файла: используются во входящем запросе, в метаданных версии и в bundle.
 */
const pluginFileBaseShape = {
  component: pluginComponentSchema,
  ai: pluginFileAiSchema.nullable().default(null),
  relativePath: z.string().min(1),
  rootPath: z.boolean().optional().default(false),
  merge: z.boolean().optional().default(false),
  mergeKeyPath: z.string().min(1).optional(),
  template: z.boolean().optional().default(false),
};

/**
 * Метаданные файла без `content` во входящем запросе: база + `format`/`targets`.
 */
const pluginFileObjectSchema = z.object({
  ...pluginFileBaseShape,
  format: pluginFileFormatSchema.optional().default("raw"),
  targets: z.array(harnessIdSchema).optional(),
});

/**
 * Метаданные файла во входящем запросе публикации/обновления версии.
 * Дополнительно требует `mergeKeyPath` для файлов с `merge: true` и согласованность `format`/`targets`:
 * `spec` — только общий (`ai: null`) файл рендерящегося компонента с непустым списком поддерживаемых целей.
 */
export const pluginFileInputSchema = pluginFileObjectSchema
  .refine((file) => !file.merge || file.mergeKeyPath !== undefined, {
    message: "merge files must specify mergeKeyPath",
    path: ["mergeKeyPath"],
  })
  .superRefine((file, ctx) => {
    if (file.format === "raw") {
      if (file.targets !== undefined) {
        ctx.addIssue({ code: "custom", message: "targets are allowed only for spec files", path: ["targets"] });
      }

      return;
    }

    if (!isSpecComponent(file.component)) {
      ctx.addIssue({
        code: "custom",
        message: `spec format is not supported for component ${file.component}`,
        path: ["format"],
      });
    }

    if (file.ai !== null) {
      ctx.addIssue({ code: "custom", message: "spec files must have ai: null", path: ["ai"] });
    }

    if (file.merge || file.rootPath || file.template) {
      ctx.addIssue({
        code: "custom",
        message: "spec files cannot be merge/rootPath/template",
        path: ["format"],
      });
    }

    if (file.targets === undefined || file.targets.length === 0) {
      ctx.addIssue({ code: "custom", message: "spec files must specify targets", path: ["targets"] });

      return;
    }

    if (new Set(file.targets).size !== file.targets.length) {
      ctx.addIssue({ code: "custom", message: "targets must be unique", path: ["targets"] });
    }

    for (const target of file.targets) {
      if (!isHarnessSupported(file.component, target)) {
        ctx.addIssue({
          code: "custom",
          message: `component ${file.component} is not supported for ${target}`,
          path: ["targets"],
        });
      }
    }
  });

/**
 * Метаданные хранимого файла в ответе сервера (без `format`/`targets`).
 */
const pluginStoredFileSchema = z.object({
  ...pluginFileBaseShape,
  mergeKeyPath: z.string().min(1).nullable(),
  sha256: z.string(),
  sizeBytes: z.string(),
});

/**
 * Метаданные файла в ответе по версии: хранимый файл + `format`/`targets` (для `raw` — `null`).
 */
export const pluginFileMetadataSchema = pluginStoredFileSchema.extend({
  format: pluginFileFormatSchema,
  targets: z.array(harnessIdSchema).nullable(),
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
 * Всегда `raw`: spec-файлы разворачиваются сервером в отдельные файлы по harness'ам.
 */
export const pluginBundleFileSchema = pluginStoredFileSchema.extend({
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
 * Файл в исходном виде (`GET /v1/admin/plugins/:slug/:version/source`): `spec` не разворачивается,
 * поэтому у файла есть `format`/`targets`. Нужен форме редактирования в админке.
 */
export const pluginSourceFileSchema = pluginFileMetadataSchema.extend({
  encoding: z.enum(["utf8", "base64"]),
  content: z.string(),
});

/**
 * Ответ `GET /v1/admin/plugins/:slug/:version/source`: версия с файлами в том виде, в каком они хранятся.
 */
export const pluginSourceResponseSchema = pluginBundleResponseSchema.extend({
  files: z.array(pluginSourceFileSchema),
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
export type PluginSourceFile = z.infer<typeof pluginSourceFileSchema>;
export type PluginSource = z.infer<typeof pluginSourceResponseSchema>;
export type PluginListItem = z.infer<typeof pluginListItemSchema>;
export type PluginListResponse = z.infer<typeof pluginListResponseSchema>;
export type PluginVersionListItem = z.infer<typeof pluginVersionListItemSchema>;
export type PluginVersionListResponse = z.infer<typeof pluginVersionListResponseSchema>;
