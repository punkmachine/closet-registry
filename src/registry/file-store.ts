import { promises as fs } from "node:fs";
import path from "node:path";
import type { ItemFile, ItemFileContent, ItemFileUpload, ItemType } from "./types.js";

export const REGISTRY_ITEMS_DIR = path.resolve(process.cwd(), "registry", "items");

export class PathTraversalError extends Error {
  constructor(public readonly unsafePath: string) {
    super(`Unsafe file path outside of item version directory: ${unsafePath}`);
    this.name = "PathTraversalError";
  }
}

export function getVersionDir(type: ItemType, name: string, version: string): string {
  return path.resolve(REGISTRY_ITEMS_DIR, type, name, version);
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
  type: ItemType,
  name: string,
  version: string,
  files: ItemFileUpload[],
): Promise<void> {
  const versionDir = getVersionDir(type, name, version);
  const targets = files.map((file) => ({
    file,
    target: resolveSafePath(versionDir, file.path),
  }));

  await fs.rm(versionDir, { recursive: true, force: true });

  for (const { file, target } of targets) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content);
  }
}

export async function readVersionFiles(
  type: ItemType,
  name: string,
  version: string,
  files: ItemFile[],
): Promise<ItemFileContent[]> {
  const versionDir = getVersionDir(type, name, version);
  return Promise.all(
    files.map(async (file) => {
      const target = resolveSafePath(versionDir, file.path);
      const content = await fs.readFile(target, "utf8");
      return { ...file, content };
    }),
  );
}

export async function deleteVersionDir(type: ItemType, name: string, version: string): Promise<void> {
  await fs.rm(getVersionDir(type, name, version), { recursive: true, force: true });
}

export async function deleteItemDir(type: ItemType, name: string): Promise<void> {
  const itemDir = path.resolve(REGISTRY_ITEMS_DIR, type, name);
  await fs.rm(itemDir, { recursive: true, force: true });
}
