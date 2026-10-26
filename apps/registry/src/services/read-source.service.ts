import type { pluginSourceResponseSchema } from "@closet/contract";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import { readVersionFiles } from "../registry/file-store.js";
import {
  findActiveVersionBySlugAndVersion,
  findLatestActiveVersion,
  getDependencySlugs,
  toAuthorRef,
} from "../registry/plugins-repository.js";
import { BundleFilesReadError, detectEncoding } from "./read-bundle.service.js";

/**
 * Версия плагина с файлами в хранимом виде (тип ответа `GET /v1/admin/plugins/:slug/:version/source`).
 */
export type Source = z.infer<typeof pluginSourceResponseSchema>;

/**
 * Сервис чтения версии без разворота spec-файлов.
 */
export interface ReadSourceService {
  /**
   * @param slug - slug плагина
   * @param version - точная semver-версия или `latest`
   * @returns версия с исходными файлами, либо `null`, если плагин или активная версия не найдены
   */
  read: (slug: string, version: string) => Promise<Source | null>;
}

/**
 * Собирает версию плагина так, как она хранится: `spec`-файлы остаются нейтральными источниками
 * с `format`/`targets`. В отличие от bundle, не предназначена для closet-cli — её читает форма редактирования.
 */
export function createReadSourceService(orm: DataSource): ReadSourceService {
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
            format: meta.format,
            targets: meta.targets,
            encoding,
            content: text,
          };
        });

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
