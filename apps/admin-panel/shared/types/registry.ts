// Контракт closet-registry, описанный на стороне админки отдельно от самого реестра.
// Дублирование намеренное: apps/admin-panel не зависит от apps/registry как от пакета
// (внутри монорепо это была бы связь фронта с TypeORM-сущностями и zod-схемами бэкенда),
// поэтому типы держатся плоскими DTO. При смене контракта реестра менять и здесь.

export const PLUGIN_COMPONENTS = ["mcp", "rules", "hooks", "agents", "commands", "skills", "scripts"] as const;
export type PluginComponent = (typeof PLUGIN_COMPONENTS)[number];

export const PLUGIN_AI_VALUES = ["codex", "claude-code"] as const;
export type PluginAi = (typeof PLUGIN_AI_VALUES)[number];

/** GET /v1/plugins */
export interface PluginListItem {
  slug: string;
  description: string;
  latestVersion: string;
  updatedAt: string;
}

export interface PluginListResponse {
  plugins: PluginListItem[];
}

/** GET /v1/plugins/:slug/versions */
export interface PluginVersionListItem {
  version: string;
  changelog: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
}

export interface PluginVersionListResponse {
  slug: string;
  versions: PluginVersionListItem[];
}

/** Файл в ответе GET /v1/plugins/:slug/:version — метаданные + содержимое. */
export interface PluginBundleFile {
  component: PluginComponent;
  ai: PluginAi | null;
  relativePath: string;
  rootPath: boolean;
  merge: boolean;
  mergeKeyPath: string | null;
  template: boolean;
  sha256: string;
  sizeBytes: string;
  encoding: "utf8" | "base64";
  content: string;
}

/** GET /v1/plugins/:slug/:version */
export interface PluginBundle {
  slug: string;
  description: string;
  version: string;
  changelog: string | null;
  dependencies: string[];
  files: PluginBundleFile[];
}

/** Метаданные файла в multipart-запросе публикации/обновления (без содержимого). */
export interface PluginFileInput {
  component: PluginComponent;
  ai: PluginAi | null;
  relativePath: string;
  rootPath: boolean;
  merge: boolean;
  mergeKeyPath?: string;
  template: boolean;
}

/** Поле `metadata` в multipart-запросе POST /v1/admin/plugins и PUT /v1/admin/plugins/:slug/:version. */
export interface PluginPublishMetadata {
  slug: string;
  description: string;
  version: string;
  changelog?: string;
  dependencies: string[];
  files: PluginFileInput[];
}

/** Лимиты @fastify/multipart на стороне реестра — дублируются в UI для превентивной валидации. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_VERSION = 200;
