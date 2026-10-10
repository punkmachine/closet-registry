/**
 * In-memory fake слоя данных реестра (вместо Postgres/TypeORM) для API-тестов.
 *
 * Воспроизводит семантику `src/registry/plugins-repository.ts` и `src/db/stats-repository.ts`:
 * soft delete плагинов/версий, воскрешение slug при публикации, latest через `semver.gt`,
 * полная замена зависимостей и файлов версии, конфликт версии (включая soft-deleted), install events.
 * Сигнатуры функций и возвращаемые формы те же, что у реальных (первый аргумент `DataSource` игнорируется).
 *
 * Подмена модулей делается в `tests/setup/mock-db.ts` (vi.mock в setupFiles проекта registry-api).
 * Хранилище — синглтон `fakeDb`: роуты получают функции модуля-подделки, тесты — те же данные через `fakeDb`
 * (его возвращает и `buildTestApp()` как `db`).
 *
 * Отличия от Postgres: нет транзакций (атомарность достигается проверкой до мутаций), сортировка slug —
 * по кодовым точкам, а не по collation БД.
 */
import semver from "semver";
/* eslint-disable unicorn/consistent-class-member-order -- секции класса сгруппированы по смыслу (состояние, инспекция, операции репозиториев), а не по видимости */
import type { DataSource } from "typeorm";
import type { Plugin } from "../../src/db/entities/plugin.entity.js";
import type { PluginFile } from "../../src/db/entities/plugin-file.entity.js";
import type { PluginVersion } from "../../src/db/entities/plugin-version.entity.js";
import type {
  PluginFileInsert,
  PluginListItem,
  PluginVersionListItem,
  PluginVersionResult,
  PluginVersionWriteInput,
} from "../../src/registry/plugins-repository.js";

/** Та же ошибка, что в реальном репозитории; роуты проверяют её через instanceof из подменённого модуля. */
export class PluginVersionConflictError extends Error {
  constructor(
    public readonly slug: string,
    public readonly version: string,
  ) {
    super(`Plugin ${slug}@${version} already exists`);
    this.name = "PluginVersionConflictError";
  }
}

/** Строка таблицы `plugins`. */
export interface PluginRecord {
  id: string;
  slug: string;
  description: string;
  deleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Строка таблицы `plugin_versions` (`pluginId` вместо связи). */
export interface VersionRecord {
  id: string;
  pluginId: string;
  version: string;
  changelog: string | null;
  deleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Строка таблицы `plugin_files`. */
export interface FileRecord extends PluginFileInsert {
  id: string;
  versionId: string;
  createdAt: Date;
}

/** Строка таблицы `install_events`. */
export interface InstallEventRecord {
  id: string;
  pluginId: string;
  pluginVersionId: string;
  cliVersion: string;
  installedAt: Date;
}

/** Имена операций, в которые можно подмешать сбой через `failNext`. */
export type FakeOperation =
  | "findMissingDependencySlugs"
  | "findAnyVersion"
  | "publishPluginVersion"
  | "updatePluginVersion"
  | "softDeleteVersion"
  | "findActiveVersionBySlugAndVersion"
  | "findLatestActiveVersion"
  | "findAllActivePluginsWithLatestVersion"
  | "findActiveVersionsBySlug"
  | "getDependencySlugs"
  | "softDeletePlugin"
  | "recordInstall";

/** Сравнение по кодовым точкам (как collation "C" в БД), а не по локали. */
function compareCodePoints(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export class FakeDb {
  private plugins: PluginRecord[] = [];
  private versions: VersionRecord[] = [];
  private files: FileRecord[] = [];
  /** Рёбра зависимостей: plugin -> dependsOn (в порядке вставки). */
  private dependencies: { pluginId: string; dependsOnPluginId: string }[] = [];
  private installs: InstallEventRecord[] = [];
  private idCounter = 0;
  private healthy = true;
  private failures = new Map<FakeOperation, Error>();

  // ---------------------------------------------------------------- внутреннее

  private checkFailure(operation: FakeOperation): void {
    const error = this.failures.get(operation);
    if (!error) {
      return;
    }

    this.failures.delete(operation);
    throw error;
  }

  private pluginBySlug(slug: string): PluginRecord | undefined {
    return this.plugins.find((p) => p.slug === slug);
  }

  private dependencySlugsOf(pluginId: string): string[] {
    const slugs: string[] = [];
    for (const edge of this.dependencies) {
      if (edge.pluginId !== pluginId) continue;
      const target = this.plugins.find((p) => p.id === edge.dependsOnPluginId);
      if (target) slugs.push(target.slug);
    }
    return slugs;
  }

  private toPluginEntity(record: PluginRecord): Plugin {
    return { ...record, versions: [], dependencies: [], dependents: [] };
  }

  private toFileEntity(record: FileRecord, version: PluginVersion): PluginFile {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- versionId намеренно отбрасывается из rest
    const { versionId: _versionId, ...rest } = record;
    return { ...rest, version };
  }

  private toVersionEntity(record: VersionRecord, plugin: PluginRecord, withFiles: boolean): PluginVersion {
    const entity: PluginVersion = {
      id: record.id,
      plugin: this.toPluginEntity(plugin),
      version: record.version,
      changelog: record.changelog,
      deleted: record.deleted,
      deletedAt: record.deletedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      files: [],
    };
    if (withFiles) {
      entity.files = this.files.filter((f) => f.versionId === record.id).map((f) => this.toFileEntity(f, entity));
    }
    return entity;
  }

  /** Активные (не удалённые) версии активного плагина с данным slug. */
  private activeVersionsOf(slug: string): { plugin: PluginRecord; versions: VersionRecord[] } | null {
    const plugin = this.pluginBySlug(slug);
    return !plugin || plugin.deleted
      ? null
      : { plugin, versions: this.versions.filter((v) => v.pluginId === plugin.id && !v.deleted) };
  }

  private replaceDependencies(pluginId: string, dependencySlugs: string[]): void {
    this.dependencies = this.dependencies.filter((d) => d.pluginId !== pluginId);
    if (dependencySlugs.length === 0) return;
    // Как в БД: находятся только активные плагины, неизвестные slug молча пропускаются; порядок — по id.
    const wanted = new Set(dependencySlugs);
    const found = this.plugins
      .filter((p) => wanted.has(p.slug) && !p.deleted)
      .toSorted((a, b) => Number(a.id) - Number(b.id));
    for (const dependsOn of found) {
      this.dependencies.push({ pluginId, dependsOnPluginId: dependsOn.id });
    }
  }

  private replaceFiles(versionId: string, inserts: PluginFileInsert[]): void {
    this.files = this.files.filter((f) => f.versionId !== versionId);
    const createdAt = new Date();
    for (const insert of inserts) {
      this.files.push({ ...insert, id: this.nextId(), versionId, createdAt });
    }
  }

  private nextId(): string {
    this.idCounter += 1;
    return String(this.idCounter);
  }

  // ---------------------------------------------------------------- управление состоянием

  /** Полный сброс данных, счётчиков id, флага health и запланированных сбоев. */
  reset(): void {
    this.plugins = [];
    this.versions = [];
    this.files = [];
    this.dependencies = [];
    this.installs = [];
    this.idCounter = 0;
    this.healthy = true;
    this.failures.clear();
  }

  /** Управляет ответом заглушки `fastify.pg.query` (GET /health: `db: "ok" | "error"`). */
  setHealthy(healthy: boolean): void {
    this.healthy = healthy;
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  /** Следующий вызов операции бросит `error` (одноразово) — для проверки 500-ветки обработчика ошибок. */
  failNext(operation: FakeOperation, error: Error = new Error(`fake db failure: ${operation}`)): void {
    this.failures.set(operation, error);
  }

  // ---------------------------------------------------------------- инспекция для тестов

  /** Все плагины, включая soft-deleted, в порядке создания. */
  getPlugins(): PluginRecord[] {
    return this.plugins.map((p) => ({ ...p }));
  }

  getPlugin(slug: string): PluginRecord | undefined {
    const plugin = this.plugins.find((p) => p.slug === slug);
    return plugin ? { ...plugin } : undefined;
  }

  /** Все версии плагина (включая soft-deleted), по возрастанию id. Неизвестный slug -> []. */
  getVersions(slug: string): VersionRecord[] {
    const plugin = this.plugins.find((p) => p.slug === slug);
    return plugin ? this.versions.filter((v) => v.pluginId === plugin.id).map((v) => ({ ...v })) : [];
  }

  getVersion(slug: string, version: string): VersionRecord | undefined {
    return this.getVersions(slug).find((v) => v.version === version);
  }

  /** Файлы версии (метаданные) в порядке вставки. Неизвестная версия -> []. */
  getFiles(slug: string, version: string): FileRecord[] {
    const found = this.getVersion(slug, version);
    return found ? this.files.filter((f) => f.versionId === found.id).map((f) => ({ ...f })) : [];
  }

  /** Slug-и зависимостей плагина (без фильтра по deleted, как реальный getDependencySlugs). */
  getDependencies(slug: string): string[] {
    const plugin = this.plugins.find((p) => p.slug === slug);
    return plugin ? this.dependencySlugsOf(plugin.id) : [];
  }

  getInstallEvents(): InstallEventRecord[] {
    return this.installs.map((e) => ({ ...e }));
  }

  installEventsCount(): number {
    return this.installs.length;
  }

  // ---------------------------------------------------------------- операции plugins-repository.ts

  findMissingDependencySlugs = async (_dataSource: DataSource, slugs: string[]): Promise<string[]> => {
    this.checkFailure("findMissingDependencySlugs");
    if (slugs.length === 0) return [];
    const existing = new Set(this.plugins.filter((p) => !p.deleted).map((p) => p.slug));
    return slugs.filter((slug) => !existing.has(slug));
  };

  /** Ищет версию в том числе среди soft-deleted (и у soft-deleted плагина). */
  findAnyVersion = async (_dataSource: DataSource, slug: string, version: string): Promise<PluginVersion | null> => {
    this.checkFailure("findAnyVersion");
    const plugin = this.pluginBySlug(slug);
    if (!plugin) return null;
    const found = this.versions.find((v) => v.pluginId === plugin.id && v.version === version);
    return found ? this.toVersionEntity(found, plugin, false) : null;
  };

  publishPluginVersion = async (
    _dataSource: DataSource,
    input: PluginVersionWriteInput,
  ): Promise<{ plugin: Plugin; version: PluginVersion }> => {
    this.checkFailure("publishPluginVersion");
    const now = new Date();
    const existing = this.pluginBySlug(input.slug);

    // Конфликт проверяем ДО мутаций: в реальности транзакция откатывается (воскрешение плагина не остаётся).
    if (existing && this.versions.some((v) => v.pluginId === existing.id && v.version === input.version)) {
      throw new PluginVersionConflictError(input.slug, input.version);
    }

    let plugin = existing;
    if (plugin) {
      // Воскрешение soft-deleted плагина под тем же slug; старые удалённые версии остаются удалёнными
      plugin.description = input.description;
      plugin.deleted = false;
      plugin.deletedAt = null;
      plugin.updatedAt = now;
    } else {
      plugin = {
        id: this.nextId(),
        slug: input.slug,
        description: input.description,
        deleted: false,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.plugins.push(plugin);
    }

    this.replaceDependencies(plugin.id, input.dependencySlugs);

    const version: VersionRecord = {
      id: this.nextId(),
      pluginId: plugin.id,
      version: input.version,
      changelog: input.changelog,
      deleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.versions.push(version);
    this.replaceFiles(version.id, input.files);

    return { plugin: this.toPluginEntity(plugin), version: this.toVersionEntity(version, plugin, true) };
  };

  /** Full replace существующей активной версии активного плагина; иначе `null`. Ничего не создаёт. */
  updatePluginVersion = async (
    _dataSource: DataSource,
    input: PluginVersionWriteInput,
  ): Promise<{ plugin: Plugin; version: PluginVersion } | null> => {
    this.checkFailure("updatePluginVersion");
    const active = this.activeVersionsOf(input.slug);
    if (!active) return null;
    const version = active.versions.find((v) => v.version === input.version);
    if (!version) return null;

    const now = new Date();
    active.plugin.description = input.description;
    active.plugin.updatedAt = now;
    this.replaceDependencies(active.plugin.id, input.dependencySlugs);
    version.changelog = input.changelog;
    version.updatedAt = now;
    this.replaceFiles(version.id, input.files);

    return { plugin: this.toPluginEntity(active.plugin), version: this.toVersionEntity(version, active.plugin, true) };
  };

  softDeleteVersion = async (_dataSource: DataSource, slug: string, version: string): Promise<PluginVersion | null> => {
    this.checkFailure("softDeleteVersion");
    const active = this.activeVersionsOf(slug);
    const found = active?.versions.find((v) => v.version === version);
    if (!active || !found) return null;

    const now = new Date();
    found.deleted = true;
    found.deletedAt = now;
    found.updatedAt = now;
    return this.toVersionEntity(found, active.plugin, false);
  };

  findActiveVersionBySlugAndVersion = async (
    _dataSource: DataSource,
    slug: string,
    version: string,
  ): Promise<PluginVersion | null> => {
    this.checkFailure("findActiveVersionBySlugAndVersion");
    const active = this.activeVersionsOf(slug);
    const found = active?.versions.find((v) => v.version === version);
    return active && found ? this.toVersionEntity(found, active.plugin, true) : null;
  };

  /** "latest" — максимум по `semver.gt` среди активных версий. */
  findLatestActiveVersion = async (_dataSource: DataSource, slug: string): Promise<PluginVersion | null> => {
    this.checkFailure("findLatestActiveVersion");
    const active = this.activeVersionsOf(slug);
    if (!active || active.versions.length === 0) return null;
    const latest = active.versions.reduce((a, b) => (semver.gt(b.version, a.version) ? b : a));
    return this.toVersionEntity(latest, active.plugin, true);
  };

  findAllActivePluginsWithLatestVersion = async (): Promise<PluginListItem[]> => {
    this.checkFailure("findAllActivePluginsWithLatestVersion");
    const items: PluginListItem[] = [];
    const activePlugins = this.plugins.filter((p) => !p.deleted).toSorted((a, b) => compareCodePoints(a.slug, b.slug));
    for (const plugin of activePlugins) {
      const versions = this.versions.filter((v) => v.pluginId === plugin.id && !v.deleted);
      if (versions.length === 0) continue;
      const latest = versions.reduce((a, b) => (semver.gt(b.version, a.version) ? b : a));
      items.push({
        slug: plugin.slug,
        description: plugin.description,
        latestVersion: latest.version,
        updatedAt: plugin.updatedAt,
      });
    }
    return items;
  };

  /** `null` — плагина нет/удалён; `[]` — активных версий нет; иначе от новой к старой по semver. */
  findActiveVersionsBySlug = async (_dataSource: DataSource, slug: string): Promise<PluginVersionListItem[] | null> => {
    this.checkFailure("findActiveVersionsBySlug");
    const active = this.activeVersionsOf(slug);
    if (!active) return null;
    return active.versions
      .map((v) => ({
        version: v.version,
        changelog: v.changelog,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        fileCount: this.files.filter((f) => f.versionId === v.id).length,
      }))
      .toSorted((a, b) => semver.rcompare(a.version, b.version));
  };

  getDependencySlugs = async (_dataSource: DataSource, pluginId: string): Promise<string[]> => {
    this.checkFailure("getDependencySlugs");
    return this.dependencySlugsOf(pluginId);
  };

  /** Помечает плагин и все его активные версии удалёнными; уже удалённый/неизвестный -> `null`. */
  softDeletePlugin = async (_dataSource: DataSource, slug: string): Promise<Plugin | null> => {
    this.checkFailure("softDeletePlugin");
    const plugin = this.pluginBySlug(slug);
    if (!plugin || plugin.deleted) return null;

    const now = new Date();
    plugin.deleted = true;
    plugin.deletedAt = now;
    plugin.updatedAt = now;
    for (const version of this.versions) {
      if (version.pluginId !== plugin.id || version.deleted) {
        continue;
      }

      version.deleted = true;
      version.deletedAt = now;
      version.updatedAt = now;
    }
    return this.toPluginEntity(plugin);
  };

  // ---------------------------------------------------------------- операции stats-repository.ts

  recordInstall = async (
    _dataSource: DataSource,
    pluginId: string,
    pluginVersionId: string,
    cliVersion: string,
  ): Promise<void> => {
    this.checkFailure("recordInstall");
    this.installs.push({ id: this.nextId(), pluginId, pluginVersionId, cliVersion, installedAt: new Date() });
  };
}

/** Единственный экземпляр на воркер/тест-файл; его же используют подменённые модули. */
export const fakeDb = new FakeDb();

/** Чистая функция из реального репозитория (не зависит от БД) — воспроизведена, чтобы не тянуть TypeORM-entity. */
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

/** Содержимое подменённого модуля `src/registry/plugins-repository.ts`. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- тип подменяемого модуля выводится из полей FakeDb
export function createRepositoryModule(db: FakeDb = fakeDb) {
  return {
    PluginVersionConflictError,
    toPluginVersionResult,
    findMissingDependencySlugs: db.findMissingDependencySlugs,
    findAnyVersion: db.findAnyVersion,
    publishPluginVersion: db.publishPluginVersion,
    updatePluginVersion: db.updatePluginVersion,
    softDeleteVersion: db.softDeleteVersion,
    findActiveVersionBySlugAndVersion: db.findActiveVersionBySlugAndVersion,
    findLatestActiveVersion: db.findLatestActiveVersion,
    findAllActivePluginsWithLatestVersion: db.findAllActivePluginsWithLatestVersion,
    findActiveVersionsBySlug: db.findActiveVersionsBySlug,
    getDependencySlugs: db.getDependencySlugs,
    softDeletePlugin: db.softDeletePlugin,
  };
}

/** Содержимое подменённого модуля `src/db/stats-repository.ts`. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- тип подменяемого модуля выводится из полей FakeDb
export function createStatsRepositoryModule(db: FakeDb = fakeDb) {
  return { recordInstall: db.recordInstall };
}
