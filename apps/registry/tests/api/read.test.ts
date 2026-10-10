import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

describe("чтение", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  const get = (url: string) => ctx.app.inject({ method: "GET", url, headers: ctx.authHeader });

  /** Публикует версию и проверяет 201, чтобы падение подготовки не маскировалось под падение теста. */
  async function publish(options: Parameters<typeof publishPlugin>[2]) {
    const response = await publishPlugin(ctx.app, ctx.authHeader, options);
    expect(response.statusCode).toBe(201);
  }

  describe("GET /v1/plugins", () => {
    it("на пустой базе -> { plugins: [] }", async () => {
      const response = await get("/v1/plugins");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ plugins: [] });
    });

    it("плагин, у которого все версии soft-deleted, в листинг не попадает", async () => {
      const gone = uniqueSlug("gone");
      const alive = uniqueSlug("alive");
      await publish({ slug: gone, version: "1.0.0" });
      await publish({ slug: gone, version: "1.1.0" });
      await publish({ slug: alive, version: "1.0.0" });

      for (const version of ["1.0.0", "1.1.0"]) {
        const del = await ctx.app.inject({
          method: "DELETE",
          url: `/v1/admin/plugins/${gone}/${version}`,
          headers: ctx.authHeader,
        });
        expect(del.statusCode).toBe(204);
      }

      const response = await get("/v1/plugins");

      expect(response.statusCode).toBe(200);
      const slugs = response.json<{ plugins: { slug: string }[] }>().plugins.map((p) => p.slug);
      expect(slugs).toEqual([alive]);
    });
  });

  describe("GET /v1/plugins/:slug/versions", () => {
    it("404 на несуществующем slug", async () => {
      const slug = uniqueSlug("missing");
      const response = await get(`/v1/plugins/${slug}/versions`);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Plugin ${slug} not found` });
    });
  });

  describe("GET /v1/plugins/:slug/:version", () => {
    it("404 на несуществующей версии существующего плагина", async () => {
      const slug = uniqueSlug("demo");
      await publish({ slug, version: "1.0.0" });

      const response = await get(`/v1/plugins/${slug}/2.0.0`);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Plugin ${slug}@2.0.0 not found` });
    });

    it("latest считается через semver, а не по дате или лексикографике (1.9.0, 1.10.0, 1.9.1 -> 1.10.0)", async () => {
      const slug = uniqueSlug("semver");
      await publish({ slug, version: "1.9.0" });
      await publish({ slug, version: "1.10.0" });
      await publish({ slug, version: "1.9.1" });

      const response = await get(`/v1/plugins/${slug}/latest`);

      expect(response.statusCode).toBe(200);
      expect(response.json<{ version: string }>().version).toBe("1.10.0");

      // Листинг использует ту же логику выбора последней версии.
      const list = await get("/v1/plugins");
      const item = list
        .json<{ plugins: { slug: string; latestVersion: string }[] }>()
        .plugins.find((p) => p.slug === slug);
      expect(item?.latestVersion).toBe("1.10.0");
    });

    it("bundle отдаёт поля плагина и метаданные каждого файла", async () => {
      const dep = uniqueSlug("dep");
      const slug = uniqueSlug("bundle");
      await publish({ slug: dep, version: "1.0.0" });

      const mergeContent = '{"mcpServers":{}}';
      const templateContent = "hello {{name}}\n";
      await publish({
        slug,
        version: "1.2.3",
        description: "bundle plugin",
        changelog: "first release",
        dependencies: [dep],
        files: [
          {
            component: "mcp",
            ai: "claude-code",
            relativePath: ".mcp.json",
            content: mergeContent,
            rootPath: true,
            merge: true,
            mergeKeyPath: "mcpServers",
          },
          { component: "rules", ai: null, relativePath: "tpl.md", content: templateContent, template: true },
        ],
      });

      const response = await get(`/v1/plugins/${slug}/1.2.3`);

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        slug: string;
        description: string;
        version: string;
        changelog: string | null;
        dependencies: string[];
        files: Record<string, unknown>[];
      }>();
      expect(body).toMatchObject({
        slug,
        description: "bundle plugin",
        version: "1.2.3",
        changelog: "first release",
        dependencies: [dep],
      });
      expect(body.files).toHaveLength(2);

      const byPath = new Map(body.files.map((f) => [f.relativePath, f]));
      expect(byPath.get(".mcp.json")).toEqual({
        component: "mcp",
        ai: "claude-code",
        relativePath: ".mcp.json",
        rootPath: true,
        merge: true,
        mergeKeyPath: "mcpServers",
        template: false,
        sha256: createHash("sha256").update(mergeContent).digest("hex"),
        sizeBytes: String(Buffer.byteLength(mergeContent)),
        encoding: "utf8",
        content: mergeContent,
      });
      expect(byPath.get("tpl.md")).toEqual({
        component: "rules",
        ai: null,
        relativePath: "tpl.md",
        rootPath: false,
        merge: false,
        mergeKeyPath: null,
        template: true,
        sha256: createHash("sha256").update(templateContent).digest("hex"),
        sizeBytes: String(Buffer.byteLength(templateContent)),
        encoding: "utf8",
        content: templateContent,
      });
    });

    it('бинарный файл приходит с encoding "base64"', async () => {
      const slug = uniqueSlug("binary");
      // 0xff/0xfe/0x80 — невалидный UTF-8, round-trip через строку теряет байты.
      const binary = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x01]);
      await publish({
        slug,
        version: "1.0.0",
        files: [{ component: "scripts", relativePath: "blob.bin", content: binary }],
      });

      const response = await get(`/v1/plugins/${slug}/1.0.0`);

      expect(response.statusCode).toBe(200);
      const [file] = response.json<{ files: { encoding: string; content: string; sizeBytes: string }[] }>().files;
      expect(file?.encoding).toBe("base64");
      expect(file?.content).toBe(binary.toString("base64"));
      expect(file?.sizeBytes).toBe(String(binary.length));
    });

    it("файлы удалены с диска -> 500 Failed to read plugin files from disk", async () => {
      const slug = uniqueSlug("nodisk");
      await publish({ slug, version: "1.0.0" });
      await rm(path.join(ctx.storageDir, slug), { recursive: true, force: true });

      const response = await get(`/v1/plugins/${slug}/1.0.0`);

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "Failed to read plugin files from disk" });
    });
  });
});
