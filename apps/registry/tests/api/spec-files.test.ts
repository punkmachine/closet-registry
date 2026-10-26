import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin, type TestPluginFile, updatePlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

interface BundleFile {
  component: string;
  ai: string | null;
  relativePath: string;
  sha256: string;
  sizeBytes: string;
  content: string;
  merge: boolean;
  mergeKeyPath: string | null;
}

const SPEC = `---
name: reviewer
description: Ревьюит диффы на баги
claude-code:
  model: sonnet
codex:
  model_reasoning_effort: high
---
Ты — строгий ревьюер.
`;

const specFile = (overrides: Partial<TestPluginFile> = {}): TestPluginFile => ({
  component: "agents",
  relativePath: "reviewer.md",
  content: SPEC,
  format: "spec",
  targets: ["claude-code", "codex"],
  ...overrides,
});

describe("spec-файлы", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  const bundleOf = async (slug: string) => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/plugins/${slug}/1.0.0`,
      headers: ctx.authHeader,
    });
    expect(response.statusCode).toBe(200);

    return response.json<{ files: BundleFile[] }>().files;
  };

  describe("публикация", () => {
    it("201, а в ответе по версии файл остаётся spec с targets", async () => {
      const slug = uniqueSlug("spec");
      const response = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0", files: [specFile()] });

      expect(response.statusCode).toBe(201);
      expect(response.json<{ files: Record<string, unknown>[] }>().files[0]).toMatchObject({
        component: "agents",
        ai: null,
        relativePath: "reviewer.md",
        format: "spec",
        targets: ["claude-code", "codex"],
      });
    });

    it("raw-файл в ответе имеет format: raw и targets: null", async () => {
      const slug = uniqueSlug("raw");
      const response = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });

      expect(response.json<{ files: Record<string, unknown>[] }>().files[0]).toMatchObject({
        format: "raw",
        targets: null,
      });
    });

    it.each([
      ["spec без targets", specFile({ targets: undefined }), "targets"],
      ["spec для skills", specFile({ component: "skills" }), "format"],
      ["spec с неизвестной целью", specFile({ targets: ["cursor" as "codex"] }), "targets"],
    ])("400: %s", async (_title, file, text) => {
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug: uniqueSlug("bad"),
        version: "1.0.0",
        files: [file],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toContain(text);
    });

    it.each([
      ["нет frontmatter", "просто текст", "Нет frontmatter"],
      ["неизвестное поле", "---\nname: a\ndescription: d\ntools: Read\n---\nx", "Неизвестные поля"],
      ["небезопасное имя", "---\nname: ../evil\ndescription: d\n---\nx", "name:"],
      ["null в блоке codex", "---\nname: a\ndescription: d\ncodex:\n  x: ~\n---\nx", "codex.x"],
    ])("400: невалидный spec — %s", async (_title, content, text) => {
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug: uniqueSlug("bad"),
        version: "1.0.0",
        files: [specFile({ content })],
      });
      const { error } = response.json<{ error: string }>();

      expect(response.statusCode).toBe(400);
      expect(error).toContain("Invalid spec");
      expect(error).toContain(text);
    });

    it("400: два spec-файла генерируют один и тот же файл", async () => {
      const response = await publishPlugin(ctx.app, ctx.authHeader, {
        slug: uniqueSlug("dup"),
        version: "1.0.0",
        files: [specFile(), specFile({ relativePath: "copy.md" })],
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toContain("generate the same file");
    });

    it("PUT: невалидный spec -> 400, версия не меняется", async () => {
      const slug = uniqueSlug("put");
      await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0", files: [specFile()] });

      const response = await updatePlugin(ctx.app, ctx.authHeader, slug, "1.0.0", {
        files: [specFile({ content: "без frontmatter" })],
      });

      expect(response.statusCode).toBe(400);
      expect(await bundleOf(slug)).toHaveLength(2);
    });
  });

  describe("bundle", () => {
    it("разворачивает один spec в два raw-файла по harness'ам", async () => {
      const slug = uniqueSlug("expand");
      await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0", files: [specFile()] });

      const files = await bundleOf(slug);

      expect(files.map((f) => `${f.component}/${f.ai ?? ""}/${f.relativePath}`)).toEqual([
        "agents/claude-code/reviewer.md",
        "agents/codex/reviewer.toml",
      ]);
      expect(files[0]?.content).toBe(
        "---\nname: reviewer\ndescription: Ревьюит диффы на баги\nmodel: sonnet\n---\n\nТы — строгий ревьюер.\n",
      );
      expect(files[1]?.content).toBe(
        'name = "reviewer"\ndescription = "Ревьюит диффы на баги"\nmodel_reasoning_effort = "high"\n' +
          'developer_instructions = """\nТы — строгий ревьюер.\n"""\n',
      );
    });

    it("sha256 и sizeBytes считаются по сгенерированному содержимому", async () => {
      const slug = uniqueSlug("hash");
      await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0", files: [specFile()] });

      const files = await bundleOf(slug);

      for (const file of files) {
        expect(file.sha256).toBe(createHash("sha256").update(file.content, "utf8").digest("hex"));
        expect(file.sizeBytes).toBe(String(Buffer.byteLength(file.content, "utf8")));
        expect(file).toMatchObject({ merge: false, mergeKeyPath: null });
        expect(file).not.toHaveProperty("format");
        expect(file).not.toHaveProperty("targets");
      }
    });

    it("targets из метаданных ограничивают набор файлов", async () => {
      const slug = uniqueSlug("one");
      await publishPlugin(ctx.app, ctx.authHeader, {
        slug,
        version: "1.0.0",
        files: [specFile({ targets: ["codex"] })],
      });

      const files = await bundleOf(slug);

      expect(files.map((f) => f.ai)).toEqual(["codex"]);
    });

    it("raw-файл с тем же компонентом/ai/путём переопределяет сгенерированный", async () => {
      const slug = uniqueSlug("override");
      await publishPlugin(ctx.app, ctx.authHeader, {
        slug,
        version: "1.0.0",
        files: [
          specFile(),
          { component: "agents", ai: "codex", relativePath: "reviewer.toml", content: 'name = "custom"\n' },
        ],
      });

      const files = await bundleOf(slug);
      const codex = files.filter((f) => f.ai === "codex");

      expect(files.map((f) => `${f.ai}/${f.relativePath}`).toSorted()).toEqual([
        "claude-code/reviewer.md",
        "codex/reviewer.toml",
      ]);
      expect(codex).toHaveLength(1);
      expect(codex[0]?.content).toBe('name = "custom"\n');
    });

    it("raw и spec соседствуют: raw-файлы отдаются как есть, порядок сохраняется", async () => {
      const slug = uniqueSlug("mixed");
      await publishPlugin(ctx.app, ctx.authHeader, {
        slug,
        version: "1.0.0",
        files: [
          { component: "rules", relativePath: "a.md", content: "# a\n" },
          specFile(),
          { component: "rules", relativePath: "z.md", content: "# z\n" },
        ],
      });

      const files = await bundleOf(slug);

      expect(files.map((f) => f.relativePath)).toEqual(["a.md", "reviewer.md", "reviewer.toml", "z.md"]);
    });
  });
});
