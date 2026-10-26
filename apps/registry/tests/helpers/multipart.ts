/**
 * Хелпер сборки multipart/form-data для POST /v1/admin/plugins и PUT /v1/admin/plugins/:slug/:version.
 *
 * Использование:
 *   const { app, authHeader } = await buildTestApp();
 *   const res = await publishPlugin(app, authHeader, {
 *     slug: "demo", version: "1.0.0",
 *     files: [{ component: "rules", relativePath: "a.md", content: "# hi" }],
 *   });
 *   expect(res.statusCode).toBe(201);
 *
 * Формат запроса (как в src/routes/admin-plugins.ts): поле `metadata` — JSON-строка, а каждый файл —
 * отдельная file-часть с именем поля `<component>::<ai|"">::<relativePath>` (buildFileKey).
 * Опции `omitContentFor` / `rawMetadata` / `extraParts` нужны для негативных сценариев (400-кейсы).
 * Без новых зависимостей: тело собирается вручную в Buffer.
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";

export type PluginComponent = "mcp" | "rules" | "hooks" | "agents" | "commands" | "skills" | "scripts";
export type PluginFileAi = "codex" | "claude-code";

export interface TestPluginFile {
  component: PluginComponent;
  /** null/не указано — общий файл. */
  ai?: PluginFileAi | null;
  relativePath: string;
  content: string | Buffer;
  rootPath?: boolean;
  merge?: boolean;
  mergeKeyPath?: string;
  template?: boolean;
  format?: "raw" | "spec";
  targets?: PluginFileAi[];
}

export interface BuildPublishPayloadOptions {
  /** Для PUT можно не указывать (подставится из URL), для POST обязателен. */
  slug?: string;
  version?: string;
  description?: string;
  changelog?: string;
  dependencies?: string[];
  /** По умолчанию один файл rules/README.md. */
  files?: TestPluginFile[];
  /** Ключи файлов (buildFileKey), для которых НЕ нужно слать file-часть (проверка "Missing file content"). */
  omitContentFor?: string[];
  /** Подменяет поле metadata как есть (невалидный JSON и т.п.); `null` — не слать поле вовсе. */
  rawMetadata?: string | null;
  /** Дополнительные file-части: имя поля -> содержимое. */
  extraParts?: Record<string, string | Buffer>;
}

export interface PublishPayload {
  payload: Buffer;
  headers: { "content-type": string };
}

/** Тот же формат ключа, что и buildFileKey в src/routes/admin-plugins.ts. */
export function fileKey(
  file: Pick<TestPluginFile, "component" | "relativePath"> & { ai?: PluginFileAi | null },
): string {
  return `${file.component}::${file.ai ?? ""}::${file.relativePath}`;
}

export const DEFAULT_TEST_FILES: TestPluginFile[] = [
  { component: "rules", relativePath: "README.md", content: "# test\n" },
];

export function buildPublishPayload(options: BuildPublishPayloadOptions = {}): PublishPayload {
  const files = options.files ?? DEFAULT_TEST_FILES;
  const boundary = `----closet-test-${randomBytes(8).toString("hex")}`;
  const chunks: Buffer[] = [];

  const addField = (name: string, value: string) => {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n`),
      Buffer.from(value, "utf8"),
      Buffer.from("\r\n"),
    );
  };
  const addFile = (name: string, content: string | Buffer) => {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="file"\r\n` +
          "Content-Type: application/octet-stream\r\n\r\n",
      ),
      Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"),
      Buffer.from("\r\n"),
    );
  };

  if (options.rawMetadata !== null) {
    const metadata =
      options.rawMetadata ??
      JSON.stringify({
        ...(options.slug !== undefined && { slug: options.slug }),
        ...(options.version !== undefined && { version: options.version }),
        description: options.description ?? "test plugin",
        ...(options.changelog !== undefined && { changelog: options.changelog }),
        dependencies: options.dependencies ?? [],
        files: files.map((f) => ({
          component: f.component,
          ai: f.ai ?? null,
          relativePath: f.relativePath,
          ...(f.rootPath !== undefined && { rootPath: f.rootPath }),
          ...(f.merge !== undefined && { merge: f.merge }),
          ...(f.mergeKeyPath !== undefined && { mergeKeyPath: f.mergeKeyPath }),
          ...(f.template !== undefined && { template: f.template }),
          ...(f.format !== undefined && { format: f.format }),
          ...(f.targets !== undefined && { targets: f.targets }),
        })),
      });
    addField("metadata", metadata);
  }

  const omit = new Set(options.omitContentFor);
  for (const f of files) {
    const key = fileKey(f);
    if (!omit.has(key)) addFile(key, f.content);
  }
  const extraParts = Object.entries(options.extraParts ?? {});
  for (const [name, content] of extraParts) addFile(name, content);

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

type AuthHeader = Record<string, string>;

/** POST /v1/admin/plugins. slug и version обязательны. */
export function publishPlugin(
  app: FastifyInstance,
  authHeader: AuthHeader,
  options: BuildPublishPayloadOptions & { slug: string; version: string },
): Promise<LightMyRequestResponse> {
  const { payload, headers } = buildPublishPayload(options);
  return app.inject({ method: "POST", url: "/v1/admin/plugins", headers: { ...authHeader, ...headers }, payload });
}

/** PUT /v1/admin/plugins/:slug/:version (full replace: передавайте полный набор файлов и зависимостей). */
export function updatePlugin(
  app: FastifyInstance,
  authHeader: AuthHeader,
  slug: string,
  version: string,
  options: BuildPublishPayloadOptions = {},
): Promise<LightMyRequestResponse> {
  const { payload, headers } = buildPublishPayload(options);
  return app.inject({
    method: "PUT",
    url: `/v1/admin/plugins/${slug}/${version}`,
    headers: { ...authHeader, ...headers },
    payload,
  });
}
