import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

interface VersionsBody {
  slug: string;
  versions: { version: string }[];
}

describe("удаление", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  /** Публикует версию и проверяет 201, чтобы падение подготовки не маскировалось под падение теста. */
  async function publish(options: Parameters<typeof publishPlugin>[2]) {
    const response = await publishPlugin(ctx.app, ctx.authHeader, options);
    expect(response.statusCode).toBe(201);
  }

  const deleteVersion = (slug: string, version: string) =>
    ctx.app.inject({ method: "DELETE", url: `/v1/admin/plugins/${slug}/${version}`, headers: ctx.authHeader });

  const deletePlugin = (slug: string) =>
    ctx.app.inject({ method: "DELETE", url: `/v1/admin/plugins/${slug}`, headers: ctx.authHeader });

  const getVersions = (slug: string) =>
    ctx.app.inject({ method: "GET", url: `/v1/plugins/${slug}/versions`, headers: ctx.authHeader });

  const getList = async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/v1/plugins", headers: ctx.authHeader });
    expect(response.statusCode).toBe(200);
    return response.json<{ plugins: { slug: string }[] }>().plugins.map((p) => p.slug);
  };

  describe("DELETE /v1/admin/plugins/:slug/:version", () => {
    it("204, версия исчезает из versions, файлы на диске остаются (soft delete)", async () => {
      const slug = uniqueSlug("delver");
      await publish({
        slug,
        version: "1.0.0",
        files: [{ component: "rules", relativePath: "a.md", content: "a-1" }],
      });
      await publish({ slug, version: "2.0.0" });

      const response = await deleteVersion(slug, "1.0.0");

      expect(response.statusCode).toBe(204);

      const versions = await getVersions(slug);
      expect(versions.statusCode).toBe(200);
      expect(versions.json<VersionsBody>().versions.map((v) => v.version)).toEqual(["2.0.0"]);

      // Удалённая версия недоступна через bundle.
      const bundle = await ctx.app.inject({
        method: "GET",
        url: `/v1/plugins/${slug}/1.0.0`,
        headers: ctx.authHeader,
      });
      expect(bundle.statusCode).toBe(404);

      // БД (fake): строка осталась, но помечена удалённой.
      const rows = ctx.db.getVersions(slug).filter((v) => v.version === "1.0.0");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.deleted).toBe(true);
      expect(rows[0]?.deletedAt).not.toBeNull();
      // Соседняя версия не затронута.
      expect(ctx.db.getVersion(slug, "2.0.0")?.deleted).toBe(false);

      // Диск: файлы удалённой версии не тронуты.
      const file = path.join(ctx.storageDir, slug, "1.0.0", "rules", "a.md");
      expect(await readFile(file, "utf8")).toBe("a-1");
    });

    it("повторное удаление той же версии -> 404", async () => {
      const slug = uniqueSlug("deltwice");
      await publish({ slug, version: "1.0.0" });
      expect((await deleteVersion(slug, "1.0.0")).statusCode).toBe(204);

      const response = await deleteVersion(slug, "1.0.0");

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Plugin ${slug}@1.0.0 not found` });
    });

    it("несуществующая версия -> 404", async () => {
      const slug = uniqueSlug("delmissing");
      await publish({ slug, version: "1.0.0" });

      const response = await deleteVersion(slug, "9.9.9");

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Plugin ${slug}@9.9.9 not found` });
    });

    it("после удаления всех версий плагин исчезает из GET /v1/plugins", async () => {
      const slug = uniqueSlug("delall");
      const other = uniqueSlug("keep");
      await publish({ slug, version: "1.0.0" });
      await publish({ slug, version: "2.0.0" });
      await publish({ slug: other, version: "1.0.0" });
      expect(await getList()).toEqual(expect.arrayContaining([slug, other]));

      expect((await deleteVersion(slug, "1.0.0")).statusCode).toBe(204);
      // Осталась одна активная версия -> плагин всё ещё в листинге.
      expect(await getList()).toContain(slug);

      expect((await deleteVersion(slug, "2.0.0")).statusCode).toBe(204);

      const list = await getList();
      expect(list).not.toContain(slug);
      expect(list).toContain(other);
    });
  });

  describe("DELETE /v1/admin/plugins/:slug", () => {
    it("204, все версии помечены удалёнными, плагин пропадает из листинга и чтения", async () => {
      const slug = uniqueSlug("delplugin");
      await publish({ slug, version: "1.0.0" });
      await publish({ slug, version: "2.0.0" });

      const response = await deletePlugin(slug);

      expect(response.statusCode).toBe(204);

      // БД (fake): плагин и обе версии помечены удалёнными.
      expect(
        ctx.db
          .getPlugins()
          .filter((p) => p.slug === slug)
          .map((p) => p.deleted),
      ).toEqual([true]);

      const versions = ctx.db
        .getVersions(slug)
        .map((v) => ({ version: v.version, deleted: v.deleted }))
        .toSorted((a, b) => a.version.localeCompare(b.version));
      expect(versions).toEqual([
        { version: "1.0.0", deleted: true },
        { version: "2.0.0", deleted: true },
      ]);

      // API: плагин не виден ни в листинге, ни по версиям, ни в bundle.
      expect(await getList()).not.toContain(slug);
      expect((await getVersions(slug)).statusCode).toBe(404);
      const bundle = await ctx.app.inject({
        method: "GET",
        url: `/v1/plugins/${slug}/latest`,
        headers: ctx.authHeader,
      });
      expect(bundle.statusCode).toBe(404);
    });

    it("повторное удаление плагина -> 404", async () => {
      const slug = uniqueSlug("delplugin2");
      await publish({ slug, version: "1.0.0" });
      expect((await deletePlugin(slug)).statusCode).toBe(204);

      const response = await deletePlugin(slug);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Plugin ${slug} not found` });
    });
  });
});
