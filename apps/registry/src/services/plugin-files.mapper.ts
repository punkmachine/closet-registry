import type { pluginPublishMetadataSchema } from "@closet/contract";
import type { z } from "zod";
import type { PluginFileUpload, writeVersionFiles } from "../registry/file-store.js";
import type { PluginFileInsert } from "../registry/plugins-repository.js";

export type PluginFileMeta = z.infer<typeof pluginPublishMetadataSchema>["files"][number];

/**
 * Строит ключ файла из компонента, ИИ и относительного пути.
 */
export function buildFileKey(component: string, ai: string | null, relativePath: string): string {
  return `${component}::${ai ?? ""}::${relativePath}`;
}

/**
 * Связывает метаданные файлов с загруженными буферами и возвращает список ненайденных.
 */
export function attachFileContents(
  files: PluginFileMeta[],
  fileBuffers: Map<string, Buffer>,
): { files: PluginFileUpload[]; missing: string[] } {
  const missing: string[] = [];
  const withContent: PluginFileUpload[] = [];

  for (const file of files) {
    const key = buildFileKey(file.component, file.ai, file.relativePath);
    const content = fileBuffers.get(key);

    if (!content) {
      missing.push(key);

      continue;
    }

    withContent.push({ component: file.component, ai: file.ai, relativePath: file.relativePath, content });
  }

  return { files: withContent, missing };
}

/**
 * Строит записи файлов для вставки в БД по метаданным и результату записи на диск.
 */
export function buildFilesForInsert(
  metadataFiles: PluginFileMeta[],
  written: Awaited<ReturnType<typeof writeVersionFiles>>,
): PluginFileInsert[] {
  return metadataFiles.map((file, index) => {
    const writtenFile = written[index];

    if (!writtenFile) {
      throw new Error("writeVersionFiles вернул меньше файлов, чем было передано на вход");
    }

    return {
      component: file.component,
      ai: file.ai,
      relativePath: file.relativePath,
      storagePath: writtenFile.storagePath,
      sha256: writtenFile.sha256,
      sizeBytes: String(writtenFile.sizeBytes),
      rootPath: file.rootPath,
      merge: file.merge,
      mergeKeyPath: file.mergeKeyPath ?? null,
      template: file.template,
      format: file.format,
      targets: file.format === "spec" ? (file.targets ?? null) : null,
    };
  });
}
