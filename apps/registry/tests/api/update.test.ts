import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin, updatePlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

interface BundleBody {
  dependencies: string[];
  files: { relativePath: string; content: string }[];
}

describe("обновление", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  const getBundle = (slug: string, version: string) =>
    ctx.app.inject({ method: "GET", url: `/v1/plugins/${slug}/${version}`, headers: ctx.authHeader });

  /** Публикует версию и проверяет 201, чтобы падение подготовки не маскировалось под падение теста. */
  async function publish(options: Parameters<typeof publishPlugin>[2]) {
    const response = await publishPlugin(ctx.app, ctx.authHeader, options);
    expect(response.statusCode).toBe(201);
  }

  const exists = async (target: string) => {
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  };

  describe("PUT /v1/admin/plugins/:slug/:version", () => {
    it("full replace: было 3 файла, обновили набором из 2 -> третий исчезает и из БД, и с диска", async () => {
      const slug = uniqueSlug("replace");
      await publish({
        slug,
        version: "1.0.0",
        files: [
          { component: "rules", relativePath: "a.md", content: "a-old" },
          { component: "rules", relativePath: "b.md", content: "b-old" },
          { component: "rules", relativePath: "c.md", content: "c-old" },
        ],
      });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", {
        files: [
          { component: "rules", relativePath: "a.md", content: "a-new" },
          { component: "rules", relativePath: "b.md", content: "b-new" },
        ],
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ files: unknown[] }>().files).toHaveLength(2);

      // БД (fake): у версии осталось ровно два файла.
      const rows = ctx.db.getFiles(slug, "1.0.0");
      expect(rows.map((r) => r.relativePath).sort()).toEqual(["a.md", "b.md"]);

      // bundle отдаёт только обновлённые файлы с новым содержимым.
      const bundle = await getBundle(slug, "1.0.0");
      expect(bundle.statusCode).toBe(200);
      const byPath = new Map(bundle.json<BundleBody>().files.map((f) => [f.relativePath, f.content]));
      expect([...byPath.keys()].sort()).toEqual(["a.md", "b.md"]);
      expect(byPath.get("a.md")).toBe("a-new");
      expect(byPath.get("b.md")).toBe("b-new");

      // Диск: директория версии пересоздана, c.md исчез.
      const rulesDir = path.join(ctx.storageDir, slug, "1.0.0", "rules");
      expect(await readFile(path.join(rulesDir, "a.md"), "utf8")).toBe("a-new");
      expect(await readFile(path.join(rulesDir, "b.md"), "utf8")).toBe("b-new");
      expect(await exists(path.join(rulesDir, "c.md"))).toBe(false);
    });

    it("зависимости заменяются полностью, а не дополняются", async () => {
      const depA = uniqueSlug("depa");
      const depB = uniqueSlug("depb");
      const depC = uniqueSlug("depc");
      const slug = uniqueSlug("deps");
      await publish({ slug: depA, version: "1.0.0" });
      await publish({ slug: depB, version: "1.0.0" });
      await publish({ slug: depC, version: "1.0.0" });
      await publish({ slug, version: "1.0.0", dependencies: [depA, depB] });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", { dependencies: [depC] });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ dependencies: string[] }>().dependencies).toEqual([depC]);

      const bundle = await getBundle(slug, "1.0.0");
      expect(bundle.statusCode).toBe(200);
      expect(bundle.json<BundleBody>().dependencies).toEqual([depC]);
    });

    it("slug в metadata не совпадает с URL -> 400", async () => {
      const slug = uniqueSlug("mismatch");
      await publish({ slug, version: "1.0.0" });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", {
        slug: uniqueSlug("other"),
        version: "1.0.0",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "slug/version в metadata должны совпадать с URL" });
    });

    it("version в metadata не совпадает с URL -> 400", async () => {
      const slug = uniqueSlug("mismatch");
      await publish({ slug, version: "1.0.0" });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", { slug, version: "2.0.0" });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "slug/version в metadata должны совпадать с URL" });
    });

    it("version в URL не semver -> 400", async () => {
      const slug = uniqueSlug("badver");
      await publish({ slug, version: "1.0.0" });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0", {});

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toMatch(/^Validation error: /);
    });

    it("неизвестная зависимость -> 404 Unknown dependencies:", async () => {
      const slug = uniqueSlug("withdep");
      const ghost = uniqueSlug("ghost");
      await publish({ slug, version: "1.0.0" });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", { dependencies: [ghost] });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Unknown dependencies: ${ghost}` });
    });

    it("несуществующий плагин -> 404 и ничего не создаётся", async () => {
      const slug = uniqueSlug("missing");

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", {});

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Plugin ${slug}@1.0.0 not found` });
      const bundle = await getBundle(slug, "1.0.0");
      expect(bundle.statusCode).toBe(404);
      expect(ctx.db.getPlugin(slug)).toBeUndefined();
    });

    it("существующий плагин, но несуществующая версия -> 404 и версия не создаётся", async () => {
      const slug = uniqueSlug("nover");
      await publish({ slug, version: "1.0.0" });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "2.0.0", {});

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: `Plugin ${slug}@2.0.0 not found` });
      expect((await getBundle(slug, "2.0.0")).statusCode).toBe(404);
      expect(ctx.db.getVersion(slug, "2.0.0")).toBeUndefined();
    });

    it("soft-deleted версия -> 404, не воскрешается", async () => {
      const slug = uniqueSlug("softdel");
      await publish({ slug, version: "1.0.0" });
      const del = await ctx.app.inject({
        method: "DELETE",
        url: `/v1/admin/plugins/${slug}/1.0.0`,
        headers: ctx.authHeader,
      });
      expect(del.statusCode).toBe(204);

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", {});

      expect(response.statusCode).toBe(404);
      expect((await getBundle(slug, "1.0.0")).statusCode).toBe(404);
      // Не воскрешена: в БД (fake) версия по-прежнему удалена.
      expect(ctx.db.getVersion(slug, "1.0.0")?.deleted).toBe(true);
    });
  });
});
