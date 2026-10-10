import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { fileKey, publishPlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

describe("публикация", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  describe("POST /v1/admin/plugins", () => {
    it("не-multipart запрос -> 400 Expected multipart/form-data request", async () => {
      const response = await ctx.app.inject({
        method: "POST",
        url: "/v1/admin/plugins",
        headers: ctx.authHeader,
        payload: { slug: uniqueSlug("json"), version: "1.0.0" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "Expected multipart/form-data request" });
    });

    it("без поля metadata -> 400", async () => {
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug: uniqueSlug("nometa"),
        version: "1.0.0",
        rawMetadata: null,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "Missing required 'metadata' field" });
    });

    it("metadata с битым JSON -> 400", async () => {
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug: uniqueSlug("badjson"),
        version: "1.0.0",
        rawMetadata: "{not a json",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "'metadata' field must contain valid JSON" });
    });

    it("невалидный semver -> 400", async () => {
      const response = await publishPlugin(ctx.app, ctx.authHeader, { slug: uniqueSlug("badver"), version: "1.0" });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toMatch(/^Validation error: version: /);
    });

    it('slug "C:" -> 400 на уровне схемы', async () => {
      const response = await publishPlugin(ctx.app, ctx.authHeader, { slug: "C:", version: "1.0.0" });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toMatch(/^Validation error: slug: /);
    });

    it("файл объявлен в metadata, но содержимое не приложено -> 400 Missing file content for:", async () => {
      const file = { component: "rules", relativePath: "README.md", content: "# hi" } as const;
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug: uniqueSlug("nocontent"),
        version: "1.0.0",
        files: [file],
        omitContentFor: [fileKey(file)],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: `Missing file content for: ${fileKey(file)}` });
    });

    it("неизвестная зависимость -> 404 Unknown dependencies:", async () => {
      const dep = uniqueSlug("ghost");
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug: uniqueSlug("withdep"),
        version: "1.0.0",
        dependencies: [dep],
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Unknown dependencies: ${dep}` });
    });

    it("повторная публикация той же версии -> 409", async () => {
      const slug = uniqueSlug("dup");
      const first = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });
      expect(first.statusCode).toBe(201);

      const second = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });

      expect(second.statusCode).toBe(409);
      expect(second.json()).toEqual({ error: `Plugin ${slug}@1.0.0 already exists` });
    });

    it("happy path -> 201, файлы лежат на диске по пути <slug>/<version>/<component>/[<ai>/]<relativePath>", async () => {
      const slug = uniqueSlug("happy");
      const rulesContent = "# rules\n";
      const mcpContent = '{"mcpServers":{}}';
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug,
        version: "1.0.0",
        description: "happy plugin",
        changelog: "init",
        files: [
          { component: "rules", relativePath: "docs/a.md", content: rulesContent },
          { component: "mcp", ai: "claude-code", relativePath: ".mcp.json", content: mcpContent },
        ],
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        slug,
        description: "happy plugin",
        version: "1.0.0",
        changelog: "init",
        dependencies: [],
      });

      const versionDir = path.join(ctx.storageDir, slug, "1.0.0");
      expect(await readFile(path.join(versionDir, "rules", "docs", "a.md"), "utf8")).toBe(rulesContent);
      expect(await readFile(path.join(versionDir, "mcp", "claude-code", ".mcp.json"), "utf8")).toBe(mcpContent);
    });

    it("публикация после soft-delete того же slug воскрешает плагин, а не падает на уникальном индексе", async () => {
      const slug = uniqueSlug("revive");
      const first = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });
      expect(first.statusCode).toBe(201);

      const del = await ctx.app.inject({ method: "DELETE", url: `/v1/admin/plugins/${slug}`, headers: ctx.authHeader });
      expect(del.statusCode).toBe(204);

      const second = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "2.0.0" });
      expect(second.statusCode).toBe(201);

      // Плагин снова активен: одна запись в БД (fake) с deleted = false, виден в листинге.
      const rows = ctx.db.getPlugins().filter((p) => p.slug === slug);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.deleted).toBe(false);
      expect(rows[0]?.deletedAt).toBeNull();
      // Старая версия остаётся удалённой, новая активна.
      expect(ctx.db.getVersion(slug, "1.0.0")?.deleted).toBe(true);
      expect(ctx.db.getVersion(slug, "2.0.0")?.deleted).toBe(false);

      const list = await ctx.app.inject({ method: "GET", url: "/v1/plugins", headers: ctx.authHeader });
      const item = list
        .json<{ plugins: { slug: string; latestVersion: string }[] }>()
        .plugins.find((p) => p.slug === slug);
      expect(item?.latestVersion).toBe("2.0.0");
    });
  });
});
