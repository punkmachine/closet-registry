import type { PluginComponent, PluginFileAi, pluginBundleResponseSchema } from "@closet/contract";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import type { PluginFile } from "../db/entities/plugin-file.entity.js";
import { readVersionFiles } from "../registry/file-store.js";
import {
  findActiveVersionBySlugAndVersion,
  findLatestActiveVersion,
  getDependencySlugs,
  toAuthorRef,
} from "../registry/plugins-repository.js";
import { bundleFileKey, generateFromSpec, sha256Hex } from "./spec-files.js";

/**
 * Выбирает кодировку для передачи содержимого файла в JSON: `utf8`, если буфер без потерь
 * преобразуется в строку и обратно, иначе (бинарные данные) — `base64`.
 * @param content - сырое содержимое файла
 * @returns кодировка и содержимое в виде строки
 */
export function detectEncoding(content: Buffer): { encoding: "utf8" | "base64"; text: string } {
  const decoded = content.toString("utf8");
  const roundTrips = Buffer.from(decoded, "utf8").equals(content);

  return roundTrips ? { encoding: "utf8", text: decoded } : { encoding: "base64", text: content.toString("base64") };
}

type BundleFile = Bundle["files"][number];

/**
 * Кодирует содержимое и собирает файл bundle.
 */
function toBundleFile(
  location: { component: PluginComponent; ai: PluginFileAi | null; relativePath: string },
  flags: Pick<BundleFile, "rootPath" | "merge" | "mergeKeyPath" | "template">,
  stats: { sha256: string; sizeBytes: string },
  content: Buffer,
): BundleFile {
  const { encoding, text } = detectEncoding(content);

  return { ...location, ...flags, ...stats, encoding, content: text };
}

/**
 * Не удалось прочитать файлы версии с диска (исходная ошибка — в `cause`).
 */
export class BundleFilesReadError extends Error {
  /**
   * Создаёт ошибку чтения файлов bundle.
   * @param cause - исходная ошибка чтения с диска
   */
  constructor(cause: unknown) {
    super("Failed to read plugin files from disk", { cause });
    this.name = "BundleFilesReadError";
  }
}

/**
 * Bundle версии плагина: метаданные и содержимое всех файлов (тип ответа `GET /v1/plugins/:slug/:version`).
 */
export type Bundle = z.infer<typeof pluginBundleResponseSchema>;

/**
 * Сервис чтения bundle версии плагина.
 */
export interface ReadBundleService {
  /**
   * @param slug - slug плагина
   * @param version - точная semver-версия или `latest`
   * @returns bundle, либо `null`, если плагин или активная версия не найдены
   */
  read: (slug: string, version: string) => Promise<Bundle | null>;
}

/**
 * Строит файлы bundle: `raw` отдаются как есть, `spec` разворачиваются в файлы по `targets`.
 *
 * @remarks Если среди `raw`-файлов есть файл с тем же компонентом, `ai` и путём, что у сгенерированного,
 * побеждает `raw` (override), а сгенерированный пропускается. Порядок файлов сохраняется.
 * @param entries - метаданные файлов версии вместе с содержимым с диска
 * @returns плоский список файлов без `spec`
 */
function expandBundleFiles(
  entries: {
    meta: Pick<
      PluginFile,
      | "component"
      | "ai"
      | "relativePath"
      | "rootPath"
      | "merge"
      | "mergeKeyPath"
      | "template"
      | "sha256"
      | "sizeBytes"
      | "format"
      | "targets"
    >;
    content: Buffer;
  }[],
): BundleFile[] {
  const rawKeys = new Set(
    entries
      .filter(({ meta }) => meta.format === "raw")
      .map(({ meta }) => bundleFileKey(meta.component, meta.ai, meta.relativePath)),
  );
  const files: BundleFile[] = [];

  for (const { meta, content } of entries) {
    if (meta.format === "raw") {
      files.push(
        toBundleFile(
          meta,
          { rootPath: meta.rootPath, merge: meta.merge, mergeKeyPath: meta.mergeKeyPath, template: meta.template },
          { sha256: meta.sha256, sizeBytes: meta.sizeBytes },
          content,
        ),
      );

      continue;
    }

    const generatedFiles = generateFromSpec(meta.component, meta.targets ?? [], content);

    for (const generated of generatedFiles) {
      if (rawKeys.has(bundleFileKey(generated.component, generated.ai, generated.relativePath))) {
        continue;
      }

      files.push(
        toBundleFile(
          generated,
          { rootPath: false, merge: false, mergeKeyPath: null, template: false },
          { sha256: sha256Hex(generated.content), sizeBytes: String(generated.content.length) },
          generated.content,
        ),
      );
    }
  }

  return files;
}

/**
 * Собирает bundle версии плагина: метаданные из БД + содержимое файлов с диска.
 *
 * @remarks `version` может быть литералом `latest` — выбор последней версии идёт
 * через semver-сравнение, а не по `created_at`.
 */
export function createReadBundleService(orm: DataSource): ReadBundleService {
  return {
    async read(slug, version) {
      const pluginVersion =
        version === "latest"
          ? await findLatestActiveVersion(orm, slug)
          : await findActiveVersionBySlugAndVersion(orm, slug, version);

      if (!pluginVersion) {
        return null;
      }

      const dependencies = await getDependencySlugs(orm, pluginVersion.plugin.id);
      const locations = pluginVersion.files.map((file) => ({
        component: file.component,
        ai: file.ai,
        relativePath: file.relativePath,
      }));

      try {
        const filesWithContent = await readVersionFiles(slug, pluginVersion.version, locations);

        const files = expandBundleFiles(
          pluginVersion.files.map((meta, index) => {
            const fileContent = filesWithContent[index];

            if (!fileContent) {
              throw new Error("readVersionFiles вернул меньше файлов, чем было запрошено");
            }

            return { meta, content: fileContent.content };
          }),
        );

        return {
          slug: pluginVersion.plugin.slug,
          description: pluginVersion.plugin.description,
          version: pluginVersion.version,
          changelog: pluginVersion.changelog,
          createdBy: toAuthorRef(pluginVersion.createdBy),
          updatedBy: toAuthorRef(pluginVersion.updatedBy),
          dependencies,
          files,
        };
      } catch (error) {
        throw new BundleFilesReadError(error);
      }
    },
  };
}
