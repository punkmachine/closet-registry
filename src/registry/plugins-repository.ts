import semver from "semver";
import type { DataSource, EntityManager } from "typeorm";
import { In } from "typeorm";
import type { PluginComponent, PluginFileAi } from "../db/entities/plugin-file.entity.js";
import { PluginFile } from "../db/entities/plugin-file.entity.js";
import { PluginDependency } from "../db/entities/plugin-dependency.entity.js";
import { Plugin } from "../db/entities/plugin.entity.js";
import { PluginVersion } from "../db/entities/plugin-version.entity.js";

export class PluginVersionConflictError extends Error {
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
  dependencies: string[];
  files: PluginFileInsert[];
}

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

export async function findAnyVersion(dataSource: DataSource, slug: string, version: string): Promise<PluginVersion | null> {
  return dataSource.getRepository(PluginVersion).findOne({
    where: { version, plugin: { slug } },
    relations: { plugin: true },
  });
}

async function upsertPluginRecord(manager: EntityManager, slug: string, description: string): Promise<Plugin> {
  const pluginRepo = manager.getRepository(Plugin);
  const existing = await pluginRepo.findOne({ where: { slug } });
  const plugin = existing ?? pluginRepo.create({ slug, description });
  plugin.description = description;
  // Публикация новой версии "воскрешает" ранее мягко удалённый плагин под тем же slug —
  // иначе slug навсегда становится непереиспользуемым после soft delete.
  plugin.deleted = false;
  plugin.deletedAt = null;
  return pluginRepo.save(plugin);
}

async function replacePluginDependencies(manager: EntityManager, plugin: Plugin, dependencySlugs: string[]): Promise<void> {
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

async function replaceVersionFiles(manager: EntityManager, version: PluginVersion, files: PluginFileInsert[]): Promise<PluginFile[]> {
  const fileRepo = manager.getRepository(PluginFile);
  // Прямой filter по колонке version_id через query builder, а не delete({ version })
  // — избегаем неоднозначности FindOptionsWhere с relation-объектом на write-пути.
  await fileRepo.createQueryBuilder().delete().where("version_id = :versionId", { versionId: version.id }).execute();
  const entities = fileRepo.create(files.map((file) => ({ ...file, version })));
  return fileRepo.save(entities);
}

export function toPluginVersionResult(plugin: Plugin, version: PluginVersion, dependencySlugs: string[]): PluginVersionResult {
  return {
    slug: plugin.slug,
    description: plugin.description,
    version: version.version,
    changelog: version.changelog,
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

export async function publishPluginVersion(
  dataSource: DataSource,
  input: PluginVersionWriteInput,
): Promise<{ plugin: Plugin; version: PluginVersion }> {
  return dataSource.transaction(async (manager) => {
    const plugin = await upsertPluginRecord(manager, input.slug, input.description);

    const versionRepo = manager.getRepository(PluginVersion);
    // { plugin: { id } }, а не { plugin } целиком — иначе TypeORM фильтрует по ВСЕМ колонкам
    // связанной сущности (включая deletedAt: null) и падает без IsNull().
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

export async function upsertPluginVersion(
  dataSource: DataSource,
  input: PluginVersionWriteInput,
): Promise<{ plugin: Plugin; version: PluginVersion }> {
  return dataSource.transaction(async (manager) => {
    const plugin = await upsertPluginRecord(manager, input.slug, input.description);

    await replacePluginDependencies(manager, plugin, input.dependencySlugs);

    const versionRepo = manager.getRepository(PluginVersion);
    let version = await versionRepo.findOne({ where: { version: input.version, plugin: { id: plugin.id } } });
    if (version) {
      version.changelog = input.changelog;
      version.deleted = false;
      version.deletedAt = null;
    } else {
      version = versionRepo.create({ plugin, version: input.version, changelog: input.changelog });
    }
    version = await versionRepo.save(version);
    version.files = await replaceVersionFiles(manager, version, input.files);

    return { plugin, version };
  });
}

export async function softDeleteVersion(dataSource: DataSource, slug: string, version: string): Promise<PluginVersion | null> {
  return dataSource.transaction(async (manager) => {
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
    return versionRepo.save(found);
  });
}

export async function findActiveVersionBySlugAndVersion(
  dataSource: DataSource,
  slug: string,
  version: string,
): Promise<PluginVersion | null> {
  return dataSource.getRepository(PluginVersion).findOne({
    where: { version, deleted: false, plugin: { slug, deleted: false } },
    relations: { plugin: true, files: true },
  });
}

// "latest" версия считается через semver.gt по всем активным версиям, а не через created_at/лексикографию
export async function findLatestActiveVersion(dataSource: DataSource, slug: string): Promise<PluginVersion | null> {
  const versions = await dataSource.getRepository(PluginVersion).find({
    where: { deleted: false, plugin: { slug, deleted: false } },
    relations: { plugin: true, files: true },
  });

  if (versions.length === 0) {
    return null;
  }

  return versions.reduce((latest, candidate) => (semver.gt(candidate.version, latest.version) ? candidate : latest));
}

export async function getDependencySlugs(dataSource: DataSource, pluginId: string): Promise<string[]> {
  const dependencies = await dataSource.getRepository(PluginDependency).find({
    where: { pluginId },
    relations: { dependsOn: true },
  });

  return dependencies.map((dependency) => dependency.dependsOn.slug);
}

export async function softDeletePlugin(dataSource: DataSource, slug: string): Promise<Plugin | null> {
  return dataSource.transaction(async (manager) => {
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
