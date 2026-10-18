import type { pluginBundleResponseSchema } from "@closet/contract";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { readVersionFiles } from "../registry/file-store.js";
import {
  findActiveVersionBySlugAndVersion,
  findLatestActiveVersion,
  getDependencySlugs,
} from "../registry/plugins-repository.js";

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

        const files = pluginVersion.files.map((meta, index) => {
          const fileContent = filesWithContent[index];

          if (!fileContent) {
            throw new Error("readVersionFiles вернул меньше файлов, чем было запрошено");
          }

          const { encoding, text } = detectEncoding(fileContent.content);

          return {
            component: meta.component,
            ai: meta.ai,
            relativePath: meta.relativePath,
            rootPath: meta.rootPath,
            merge: meta.merge,
            mergeKeyPath: meta.mergeKeyPath,
            template: meta.template,
            sha256: meta.sha256,
            sizeBytes: meta.sizeBytes,
            encoding,
            content: text,
          };
        });

        return {
          slug: pluginVersion.plugin.slug,
          description: pluginVersion.plugin.description,
          version: pluginVersion.version,
          changelog: pluginVersion.changelog,
          createdBy: { username: "unknown" },
          updatedBy: { username: "unknown" },
          dependencies,
          files,
        };
      } catch (error) {
        throw new BundleFilesReadError(error);
      }
    },
  };
}
