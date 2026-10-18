import { pluginPublishMetadataSchema, pluginUpdateMetadataSchema } from "@closet/contract";
import type { DataSource } from "typeorm";
import type { z } from "zod";
import type { User } from "../db/entities/index.js";
import { BadRequestError, ConflictError, NotFoundError } from "../errors/http-error.js";
import { writeVersionFiles } from "../registry/file-store.js";
import { formatZodError, parseMetadataJson } from "../registry/multipart-helpers.js";
import {
  findActiveVersionBySlugAndVersion,
  findAnyVersion,
  findMissingDependencySlugs,
  type PluginVersionResult,
  publishPluginVersion,
  toPluginVersionResult,
  updatePluginVersion,
} from "../registry/plugins-repository.js";
import { attachFileContents, buildFilesForInsert, type PluginFileMeta } from "./plugin-files.mapper.js";

export interface PublishPluginService {
  publish: (metadataRaw: unknown, fileBuffers: Map<string, Buffer>, actor: User) => Promise<PluginVersionResult>;
  update: (
    slug: string,
    version: string,
    metadataRaw: unknown,
    fileBuffers: Map<string, Buffer>,
    actor: User,
  ) => Promise<PluginVersionResult>;
}

/**
 * Разбирает поле `metadata` (JSON) и валидирует его zod-схемой.
 * Тексты ошибок — часть HTTP-контракта, менять их нельзя.
 */
function parseMetadata<S extends z.ZodType>(metadataRaw: unknown, schema: S): z.infer<S> {
  const parsedJson = parseMetadataJson(metadataRaw);

  if (!parsedJson.ok) {
    throw new BadRequestError(parsedJson.error);
  }

  const result = schema.safeParse(parsedJson.value);

  if (!result.success) {
    throw new BadRequestError(formatZodError(result.error));
  }

  return result.data;
}

/**
 * Прикрепляет содержимое файлов из multipart к метаданным; нехватка содержимого -> `400`.
 */
function attachContents(files: PluginFileMeta[], fileBuffers: Map<string, Buffer>) {
  const { files: filesWithContent, missing } = attachFileContents(files, fileBuffers);

  if (missing.length > 0) {
    throw new BadRequestError(`Missing file content for: ${missing.join(", ")}`);
  }

  return filesWithContent;
}

/**
 * Бизнес-логика публикации/обновления версии плагина.
 *
 * @remarks Общий конвейер: `attachFileContents` -> `findMissingDependencySlugs` ->
 * `writeVersionFiles` -> репозиторий. `PathTraversalError` и `PluginVersionConflictError`
 * не ловятся здесь — их мапит глобальный `setErrorHandler`.
 */
export function createPublishPluginService(orm: DataSource): PublishPluginService {
  async function assertDependenciesExist(dependencies: string[]): Promise<void> {
    const missingDeps = await findMissingDependencySlugs(orm, dependencies);

    if (missingDeps.length > 0) {
      throw new NotFoundError(`Unknown dependencies: ${missingDeps.join(", ")}`);
    }
  }

  return {
    async publish(metadataRaw, fileBuffers, actor) {
      const body = parseMetadata(metadataRaw, pluginPublishMetadataSchema);
      const filesWithContent = attachContents(body.files, fileBuffers);

      await assertDependenciesExist(body.dependencies);

      if (await findAnyVersion(orm, body.slug, body.version)) {
        throw new ConflictError(`Plugin ${body.slug}@${body.version} already exists`);
      }

      const written = await writeVersionFiles(body.slug, body.version, filesWithContent);
      const { plugin, version } = await publishPluginVersion(orm, {
        slug: body.slug,
        description: body.description,
        version: body.version,
        changelog: body.changelog ?? null,
        dependencySlugs: body.dependencies,
        files: buildFilesForInsert(body.files, written),
        actor,
      });

      return toPluginVersionResult(plugin, version, body.dependencies);
    },

    async update(slug, version, metadataRaw, fileBuffers, actor) {
      const body = parseMetadata(metadataRaw, pluginUpdateMetadataSchema);

      if ((body.slug !== undefined && body.slug !== slug) || (body.version !== undefined && body.version !== version)) {
        throw new BadRequestError("slug/version в metadata должны совпадать с URL");
      }

      // eslint-disable-next-line unicorn/no-declarations-before-early-exit -- порядок статусов 400 -> 404 зафиксирован тестами
      const filesWithContent = attachContents(body.files, fileBuffers);

      if (!(await findActiveVersionBySlugAndVersion(orm, slug, version))) {
        throw new NotFoundError(`Plugin ${slug}@${version} not found`);
      }

      await assertDependenciesExist(body.dependencies);

      const written = await writeVersionFiles(slug, version, filesWithContent);
      const updated = await updatePluginVersion(orm, {
        slug,
        description: body.description,
        version,
        changelog: body.changelog ?? null,
        dependencySlugs: body.dependencies,
        files: buildFilesForInsert(body.files, written),
        actor,
      });

      if (!updated) {
        throw new NotFoundError(`Plugin ${slug}@${version} not found`);
      }

      return toPluginVersionResult(updated.plugin, updated.version, body.dependencies);
    },
  };
}
