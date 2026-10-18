import type { AuthorRef, PluginComponent, PluginFileAi } from "@closet/contract";
import semver from "semver";
import type { DataSource, EntityManager } from "typeorm";
import { In } from "typeorm";
import { Plugin } from "../db/entities/plugin.entity.js";
import { PluginDependency } from "../db/entities/plugin-dependency.entity.js";
import { PluginFile } from "../db/entities/plugin-file.entity.js";
import { PluginVersion } from "../db/entities/plugin-version.entity.js";

/**
 *
 */
export class PluginVersionConflictError extends Error {
  /**
   *
   */
  constructor(
    public readonly slug: string,
    public readonly version: string,
  ) {
    super(`Plugin ${slug}@${version} already exists`);
    this.name = "PluginVersionConflictError";
  }
}

export interface PluginFileInsert {
  component: PluginComponent;
  ai: PluginFileAi | null;
  relativePath: string;
  storagePath: string;
  sha256: string;
  sizeBytes: string;
  rootPath: boolean;
  merge: boolean;
  mergeKeyPath: string | null;
  template: boolean;
}

export interface PluginVersionWriteInput {
  slug: string;
  description: string;
  version: string;
  changelog: string | null;
  dependencySlugs: string[];
  files: PluginFileInsert[];
}

export interface PluginVersionResult {
  slug: string;
  description: string;
  version: string;
  changelog: string | null;
  createdBy: AuthorRef;
  updatedBy: AuthorRef;
  dependencies: string[];
  files: PluginFileInsert[];
}

/**
 *
 */
export async function findMissingDependencySlugs(dataSource: DataSource, slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) {
    return [];
  }

  const found = await dataSource.getRepository(Plugin).find({
    where: { slug: In(slugs), deleted: false },
    select: { slug: true },
  });

  const existing = new Set(found.map((plugin) => plugin.slug));
  return slugs.filter((slug) => !existing.has(slug));
}

/**
 *
 */
export async function findAnyVersion(
  dataSource: DataSource,
  slug: string,
  version: string,
): Promise<PluginVersion | null> {
  return await dataSource.getRepository(PluginVersion).findOne({
    where: { version, plugin: { slug } },
    relations: { plugin: true },
  });
}

/**
 * Создаёт плагин или обновляет описание существующего.
 *
 * @remarks
 * Публикация новой версии «воскрешает» ранее мягко удалённый плагин под тем же slug: иначе slug
 * навсегда становится непереиспользуемым после soft delete.
 */
async function upsertPluginRecord(manager: EntityManager, slug: string, description: string): Promise<Plugin> {
  const pluginRepo = manager.getRepository(Plugin);
  const existing = await pluginRepo.findOne({ where: { slug } });
  const plugin = existing ?? pluginRepo.create({ slug, description });
  plugin.description = description;
  plugin.deleted = false;
  plugin.deletedAt = null;
  return await pluginRepo.save(plugin);
}

async function replacePluginDependencies(
  manager: EntityManager,
  plugin: Plugin,
  dependencySlugs: string[],
): Promise<void> {
  const dependencyRepo = manager.getRepository(PluginDependency);
  await dependencyRepo.delete({ pluginId: plugin.id });

  if (dependencySlugs.length === 0) {
    return;
  }

  const dependencies = await manager
    .getRepository(Plugin)
    .find({ where: { slug: In(dependencySlugs), deleted: false } });

  await dependencyRepo.save(dependencies.map((dependsOn) => dependencyRepo.create({ plugin, dependsOn })));
}

/**
 * Заменяет все файлы версии переданным набором.
 *
 * @remarks
 * Удаление идёт прямым фильтром по колонке `version_id` через query builder, а не `delete({ version })`:
 * так нет неоднозначности `FindOptionsWhere` с relation-объектом на write-пути.
 */
async function replaceVersionFiles(
  manager: EntityManager,
  version: PluginVersion,
  files: PluginFileInsert[],
): Promise<PluginFile[]> {
  const fileRepo = manager.getRepository(PluginFile);
  await fileRepo.createQueryBuilder().delete().where("version_id = :versionId", { versionId: version.id }).execute();
  const entities = fileRepo.create(files.map((file) => ({ ...file, version })));
  return await fileRepo.save(entities);
}

/**
 *
 */
export function toPluginVersionResult(
  plugin: Plugin,
  version: PluginVersion,
  dependencySlugs: string[],
): PluginVersionResult {
  return {
    slug: plugin.slug,
    description: plugin.description,
    version: version.version,
    changelog: version.changelog,
    // TODO: заглушка, подставлять реального автора из БД
    createdBy: { username: "unknown" },
    updatedBy: { username: "unknown" },
    dependencies: dependencySlugs,
    files: version.files.map((file) => ({
      component: file.component,
      ai: file.ai,
      relativePath: file.relativePath,
      storagePath: file.storagePath,
      sha256: file.sha256,
      sizeBytes: file.sizeBytes,
      rootPath: file.rootPath,
      merge: file.merge,
      mergeKeyPath: file.mergeKeyPath,
      template: file.template,
    })),
  };
}

/**
 * Публикует новую версию плагина в одной транзакции.
 *
 * @remarks
 * Версия ищется по `{ plugin: { id: plugin.id } }`, а не по `{ plugin }` целиком: во втором случае TypeORM
 * фильтрует по всем колонкам связанной сущности (включая `deletedAt: null`) и падает без явного `IsNull()`.
 */
export async function publishPluginVersion(
  dataSource: DataSource,
  input: PluginVersionWriteInput,
): Promise<{ plugin: Plugin; version: PluginVersion }> {
  return await dataSource.transaction(async (manager) => {
    const plugin = await upsertPluginRecord(manager, input.slug, input.description);

    const versionRepo = manager.getRepository(PluginVersion);
    const existingVersion = await versionRepo.findOne({ where: { version: input.version, plugin: { id: plugin.id } } });
    if (existingVersion) {
      throw new PluginVersionConflictError(input.slug, input.version);
    }

    await replacePluginDependencies(manager, plugin, input.dependencySlugs);

    let version = versionRepo.create({ plugin, version: input.version, changelog: input.changelog });
    version = await versionRepo.save(version);
    version.files = await replaceVersionFiles(manager, version, input.files);

    return { plugin, version };
  });
}

/**
 * Полностью заменяет файлы и зависимости существующей активной версии активного плагина.
 *
 * @remarks
 * Ничего не создаёт и не «воскрешает»: публикация новых версий и воскрешение soft-deleted slug — только
 * через {@link publishPluginVersion} (POST). Возвращает `null`, если плагин или версия не найдены или
 * удалены (роут отвечает `404`).
 */
export async function updatePluginVersion(
  dataSource: DataSource,
  input: PluginVersionWriteInput,
): Promise<{ plugin: Plugin; version: PluginVersion } | null> {
  return await dataSource.transaction(async (manager) => {
    const plugin = await manager.getRepository(Plugin).findOne({ where: { slug: input.slug, deleted: false } });
    if (!plugin) {
      return null;
    }

    const versionRepo = manager.getRepository(PluginVersion);
    const existing = await versionRepo.findOne({
      where: { version: input.version, deleted: false, plugin: { id: plugin.id } },
    });
    if (!existing) {
      return null;
    }

    plugin.description = input.description;
    await manager.getRepository(Plugin).save(plugin);

    await replacePluginDependencies(manager, plugin, input.dependencySlugs);

    existing.changelog = input.changelog;
    const version = await versionRepo.save(existing);
    version.files = await replaceVersionFiles(manager, version, input.files);

    return { plugin, version };
  });
}

/**
 *
 */
export async function softDeleteVersion(
  dataSource: DataSource,
  slug: string,
  version: string,
): Promise<PluginVersion | null> {
  return await dataSource.transaction(async (manager) => {
    const versionRepo = manager.getRepository(PluginVersion);
    const found = await versionRepo.findOne({
      where: { version, deleted: false, plugin: { slug, deleted: false } },
      relations: { plugin: true },
    });
    if (!found) {
      return null;
    }

    found.deleted = true;
    found.deletedAt = new Date();
    return await versionRepo.save(found);
  });
}

/**
 *
 */
export async function findActiveVersionBySlugAndVersion(
  dataSource: DataSource,
  slug: string,
  version: string,
): Promise<PluginVersion | null> {
  return await dataSource.getRepository(PluginVersion).findOne({
    where: { version, deleted: false, plugin: { slug, deleted: false } },
    relations: { plugin: true, files: true },
  });
}

/**
 * Находит последнюю активную версию плагина.
 *
 * @remarks
 * «Последняя» считается через `semver.gt` по всем активным версиям, а не через `created_at` или
 * лексикографическую сортировку.
 */
export async function findLatestActiveVersion(dataSource: DataSource, slug: string): Promise<PluginVersion | null> {
  const versions = await dataSource.getRepository(PluginVersion).find({
    where: { deleted: false, plugin: { slug, deleted: false } },
    relations: { plugin: true, files: true },
  });

  return versions.length === 0
    ? null
    : versions.reduce((latest, candidate) => (semver.gt(candidate.version, latest.version) ? candidate : latest));
}

export interface PluginListItem {
  slug: string;
  description: string;
  latestVersion: string;
  updatedAt: Date;
}

/**
 * Список активных плагинов с последней версией каждого.
 *
 * @remarks
 * Один запрос с `relations: { versions: true }` (JOIN), а не N+1. Плагины без единой активной версии
 * в листинг не попадают: они не устанавливаемы, показывать их как доступные было бы неверно.
 */
export async function findAllActivePluginsWithLatestVersion(dataSource: DataSource): Promise<PluginListItem[]> {
  const plugins = await dataSource.getRepository(Plugin).find({
    where: { deleted: false },
    relations: { versions: true },
    order: { slug: "ASC" },
  });

  const items: PluginListItem[] = [];
  for (const plugin of plugins) {
    const activeVersions = plugin.versions.filter((version) => !version.deleted);
    if (activeVersions.length === 0) {
      continue;
    }

    const latest = activeVersions.reduce((a, b) => (semver.gt(b.version, a.version) ? b : a));
    items.push({
      slug: plugin.slug,
      description: plugin.description,
      latestVersion: latest.version,
      updatedAt: plugin.updatedAt,
    });
  }

  return items;
}

export interface PluginVersionListItem {
  version: string;
  changelog: string | null;
  createdAt: Date;
  updatedAt: Date;
  fileCount: number;
}

/**
 * Активные версии одного плагина, от новой к старой.
 *
 * @remarks
 * Порядок по semver, а не по `created_at`: версию можно опубликовать задним числом. Плагин без активных
 * версий отдаёт пустой массив, а несуществующий или удалённый — `null`, чтобы роут различал `200` и `404`.
 */
export async function findActiveVersionsBySlug(
  dataSource: DataSource,
  slug: string,
): Promise<PluginVersionListItem[] | null> {
  const plugin = await dataSource.getRepository(Plugin).findOne({ where: { slug, deleted: false } });
  if (!plugin) {
    return null;
  }

  const versions = await dataSource.getRepository(PluginVersion).find({
    where: { deleted: false, plugin: { id: plugin.id } },
    relations: { files: true },
  });

  return versions
    .map((version) => ({
      version: version.version,
      changelog: version.changelog,
      createdAt: version.createdAt,
      updatedAt: version.updatedAt,
      fileCount: version.files.length,
    }))
    .toSorted((a, b) => semver.rcompare(a.version, b.version));
}

/**
 *
 */
export async function getDependencySlugs(dataSource: DataSource, pluginId: string): Promise<string[]> {
  const dependencies = await dataSource.getRepository(PluginDependency).find({
    where: { pluginId },
    relations: { dependsOn: true },
  });

  return dependencies.map((dependency) => dependency.dependsOn.slug);
}

/**
 *
 */
export async function softDeletePlugin(dataSource: DataSource, slug: string): Promise<Plugin | null> {
  return await dataSource.transaction(async (manager) => {
    const pluginRepo = manager.getRepository(Plugin);
    const versionRepo = manager.getRepository(PluginVersion);

    const plugin = await pluginRepo.findOne({ where: { slug, deleted: false } });
    if (!plugin) {
      return null;
    }

    plugin.deleted = true;
    plugin.deletedAt = new Date();
    await pluginRepo.save(plugin);

    const activeVersions = await versionRepo.find({ where: { plugin: { id: plugin.id }, deleted: false } });
    if (activeVersions.length > 0) {
      const deletedAt = new Date();
      for (const activeVersion of activeVersions) {
        activeVersion.deleted = true;
        activeVersion.deletedAt = deletedAt;
      }
      await versionRepo.save(activeVersions);
    }

    return plugin;
  });
}
