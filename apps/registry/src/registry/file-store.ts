import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PluginComponent, PluginFileAi } from "../db/entities/plugin-file.entity.js";

// В Docker содержимое плагинов живёт на примонтированном томе (REGISTRY_STORAGE_DIR=/data/plugins),
// а не внутри дерева исходников — поэтому путь настраиваемый. Дефолт сохранён для локальной разработки.
export const REGISTRY_PLUGINS_DIR = process.env.REGISTRY_STORAGE_DIR
  ? path.resolve(process.env.REGISTRY_STORAGE_DIR)
  : path.resolve(process.cwd(), "registry", "plugins");

export class PathTraversalError extends Error {
  constructor(public readonly unsafePath: string) {
    super(`Unsafe file path outside of plugin version directory: ${unsafePath}`);
    this.name = "PathTraversalError";
  }
}

export interface PluginFileLocation {
  component: PluginComponent;
  ai: PluginFileAi | null;
  relativePath: string;
}

export interface PluginFileUpload extends PluginFileLocation {
  content: Buffer;
}

export interface PluginFileWritten extends PluginFileLocation {
  storagePath: string;
  sha256: string;
  sizeBytes: number;
}

export interface PluginFileRead extends PluginFileLocation {
  content: Buffer;
}

function assertSafeSlugSegment(value: string): string {
  if (value.length === 0 || value.includes("\0") || value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new PathTraversalError(value);
  }
  return value;
}

export function getPluginVersionDir(pluginSlug: string, version: string): string {
  return path.resolve(REGISTRY_PLUGINS_DIR, assertSafeSlugSegment(pluginSlug), assertSafeSlugSegment(version));
}

function buildStorageRelativePath(component: PluginComponent, ai: PluginFileAi | null, relativePath: string): string {
  return ai === null ? path.join(component, relativePath) : path.join(component, ai, relativePath);
}

function resolveSafePath(versionDir: string, relativePath: string): string {
  if (
    relativePath.length === 0 ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    /^[a-zA-Z]:/.test(relativePath)
  ) {
    throw new PathTraversalError(relativePath);
  }

  const resolved = path.resolve(versionDir, relativePath);
  const relativeToVersionDir = path.relative(versionDir, resolved);

  if (relativeToVersionDir.startsWith("..") || path.isAbsolute(relativeToVersionDir)) {
    throw new PathTraversalError(relativePath);
  }

  return resolved;
}

export async function writeVersionFiles(
  pluginSlug: string,
  version: string,
  files: PluginFileUpload[],
): Promise<PluginFileWritten[]> {
  const versionDir = getPluginVersionDir(pluginSlug, version);
  const targets = files.map((file) => ({
    file,
    target: resolveSafePath(versionDir, buildStorageRelativePath(file.component, file.ai, file.relativePath)),
  }));

  await fs.rm(versionDir, { recursive: true, force: true });

  const written: PluginFileWritten[] = [];
  for (const { file, target } of targets) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content);
    written.push({
      component: file.component,
      ai: file.ai,
      relativePath: file.relativePath,
      storagePath: target,
      sha256: createHash("sha256").update(file.content).digest("hex"),
      sizeBytes: file.content.byteLength,
    });
  }

  return written;
}

export async function readVersionFiles(
  pluginSlug: string,
  version: string,
  files: PluginFileLocation[],
): Promise<PluginFileRead[]> {
  const versionDir = getPluginVersionDir(pluginSlug, version);
  return Promise.all(
    files.map(async (file) => {
      const target = resolveSafePath(versionDir, buildStorageRelativePath(file.component, file.ai, file.relativePath));
      const content = await fs.readFile(target);
      return { ...file, content };
    }),
  );
}
