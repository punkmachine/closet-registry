import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertSafeSlugSegment,
  buildStorageRelativePath,
  getPluginVersionDir,
  getRegistryPluginsDir,
  PathTraversalError,
  readVersionFiles,
  resolveSafePath,
  writeVersionFiles,
} from "../../src/registry/file-store.js";
import { useTempStorageDir } from "../helpers/build-test-app.js";

type TempStorage = Awaited<ReturnType<typeof useTempStorageDir>>;

describe("getRegistryPluginsDir", () => {
  const original = process.env.REGISTRY_STORAGE_DIR;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.REGISTRY_STORAGE_DIR;
    } else {
      process.env.REGISTRY_STORAGE_DIR = original;
    }
  });

  it("читает REGISTRY_STORAGE_DIR и приводит к абсолютному пути", () => {
    process.env.REGISTRY_STORAGE_DIR = "some/relative/dir";
    expect(getRegistryPluginsDir()).toBe(path.resolve("some/relative/dir"));
  });

  it("без переменной окружения использует <cwd>/registry/plugins", () => {
    delete process.env.REGISTRY_STORAGE_DIR;
    expect(getRegistryPluginsDir()).toBe(path.resolve(process.cwd(), "registry", "plugins"));
  });
});

describe("resolveSafePath", () => {
  const versionDir = path.resolve("/tmp-version-dir/plugin/1.0.0");

  it("разрешает обычный вложенный путь", () => {
    expect(resolveSafePath(versionDir, "rules/a.md")).toBe(path.resolve(versionDir, "rules/a.md"));
  });

  it("разрешает путь с .., не выходящий за пределы каталога версии", () => {
    expect(resolveSafePath(versionDir, "rules/../hooks/a.md")).toBe(path.resolve(versionDir, "hooks/a.md"));
  });

  it("отклоняет пустой путь", () => {
    expect(() => resolveSafePath(versionDir, "")).toThrow(PathTraversalError);
  });

  it("отклоняет null-байт", () => {
    expect(() => resolveSafePath(versionDir, "a\0b")).toThrow(PathTraversalError);
  });

  it("отклоняет абсолютный путь", () => {
    expect(() => resolveSafePath(versionDir, path.resolve("/etc/passwd"))).toThrow(PathTraversalError);
  });

  it("отклоняет букву диска Windows", () => {
    expect(() => resolveSafePath(versionDir, "C:evil.txt")).toThrow(PathTraversalError);
    expect(() => resolveSafePath(versionDir, "d:/evil.txt")).toThrow(PathTraversalError);
  });

  it("отклоняет выход за каталог версии через ..", () => {
    expect(() => resolveSafePath(versionDir, "../x")).toThrow(PathTraversalError);
    expect(() => resolveSafePath(versionDir, "a/../../x")).toThrow(PathTraversalError);
  });

  it("кладёт исходный небезопасный путь в unsafePath", () => {
    let caught: unknown;
    try {
      resolveSafePath(versionDir, "../x");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PathTraversalError);
    const traversal = caught as PathTraversalError;
    expect(traversal.unsafePath).toBe("../x");
    expect(traversal.name).toBe("PathTraversalError");
    expect(traversal.message).toContain("../x");
  });
});

describe("assertSafeSlugSegment", () => {
  let storage: TempStorage;

  beforeEach(async () => {
    storage = await useTempStorageDir();
  });

  afterEach(async () => {
    await storage.dispose();
  });

  it("возвращает безопасный сегмент как есть", () => {
    expect(assertSafeSlugSegment("my-plugin")).toBe("my-plugin");
    expect(assertSafeSlugSegment("1.2.3")).toBe("1.2.3");
  });

  it.each([
    ["точка", "."],
    ["две точки", ".."],
    ["пустая строка", ""],
    ["null-байт", "a\0b"],
    ["прямой слэш", "a/b"],
    ["обратный слэш", String.raw`a\b`],
    ["префикс .. в имени", "..foo"],
  ])("отклоняет: %s", (_name, value) => {
    expect(() => assertSafeSlugSegment(value)).toThrow(PathTraversalError);
  });

  it.runIf(process.platform === "win32")("отклоняет букву диска на Windows-хосте", () => {
    expect(() => assertSafeSlugSegment("C:")).toThrow(PathTraversalError);
  });
});

describe("getPluginVersionDir", () => {
  let storage: TempStorage;

  beforeEach(async () => {
    storage = await useTempStorageDir();
  });

  afterEach(async () => {
    await storage.dispose();
  });

  it("строит <storage>/<slug>/<version>", () => {
    expect(getPluginVersionDir("plug", "1.0.0")).toBe(path.resolve(storage.storageDir, "plug", "1.0.0"));
  });

  it("отклоняет небезопасные slug и version", () => {
    expect(() => getPluginVersionDir("..", "1.0.0")).toThrow(PathTraversalError);
    expect(() => getPluginVersionDir("plug", "a/b")).toThrow(PathTraversalError);
  });
});

describe("buildStorageRelativePath", () => {
  it("без ai: <component>/<relativePath>", () => {
    expect(buildStorageRelativePath("rules", null, "a.md")).toBe(path.join("rules", "a.md"));
  });

  it("с ai: <component>/<ai>/<relativePath>", () => {
    expect(buildStorageRelativePath("rules", "claude-code", "dir/a.md")).toBe(
      path.join("rules", "claude-code", "dir", "a.md"),
    );
  });
});

describe("writeVersionFiles / readVersionFiles", () => {
  let storage: TempStorage;

  beforeEach(async () => {
    storage = await useTempStorageDir();
  });

  afterEach(async () => {
    await storage.dispose();
  });

  it("записывает файлы и возвращает метаданные с sha256 и размером", async () => {
    const content = Buffer.from("hello мир");
    const written = await writeVersionFiles("plug", "1.0.0", [
      { component: "rules", ai: null, relativePath: "a.md", content },
      { component: "hooks", ai: "claude-code", relativePath: "sub/b.json", content: Buffer.from("{}") },
    ]);

    const versionDir = path.resolve(storage.storageDir, "plug", "1.0.0");
    expect(written).toHaveLength(2);
    expect(written[0]).toEqual({
      component: "rules",
      ai: null,
      relativePath: "a.md",
      storagePath: path.join(versionDir, "rules", "a.md"),
      sha256: createHash("sha256").update(content).digest("hex"),
      sizeBytes: content.byteLength,
    });
    expect(written[1]?.storagePath).toBe(path.join(versionDir, "hooks", "claude-code", "sub", "b.json"));
    expect(await readFile(path.join(versionDir, "rules", "a.md"))).toEqual(content);
  });

  it("с пустым списком файлов возвращает пустой массив", async () => {
    await expect(writeVersionFiles("plug", "1.0.0", [])).resolves.toEqual([]);
  });

  it("перед записью удаляет старое содержимое каталога версии (full replace)", async () => {
    await writeVersionFiles("plug", "1.0.0", [
      { component: "rules", ai: null, relativePath: "old.md", content: Buffer.from("old") },
    ]);
    await writeVersionFiles("plug", "1.0.0", [
      { component: "rules", ai: null, relativePath: "new.md", content: Buffer.from("new") },
    ]);

    const files = await readdir(path.join(storage.storageDir, "plug", "1.0.0", "rules"));
    expect(files).toEqual(["new.md"]);
  });

  it("не трогает другие версии того же плагина", async () => {
    await writeVersionFiles("plug", "1.0.0", [
      { component: "rules", ai: null, relativePath: "a.md", content: Buffer.from("v1") },
    ]);
    await writeVersionFiles("plug", "2.0.0", [
      { component: "rules", ai: null, relativePath: "a.md", content: Buffer.from("v2") },
    ]);

    const v1 = await readFile(path.join(storage.storageDir, "plug", "1.0.0", "rules", "a.md"), "utf8");
    expect(v1).toBe("v1");
  });

  it("при небезопасном пути бросает PathTraversalError и ничего не удаляет/не пишет", async () => {
    await writeVersionFiles("plug", "1.0.0", [
      { component: "rules", ai: null, relativePath: "keep.md", content: Buffer.from("keep") },
    ]);

    await expect(
      writeVersionFiles("plug", "1.0.0", [
        { component: "rules", ai: null, relativePath: "ok.md", content: Buffer.from("x") },
        { component: "rules", ai: null, relativePath: "../../../escape.md", content: Buffer.from("x") },
      ]),
    ).rejects.toBeInstanceOf(PathTraversalError);

    // Валидация происходит до fs.rm: старые файлы на месте, новые не появились
    const kept = await readFile(path.join(storage.storageDir, "plug", "1.0.0", "rules", "keep.md"), "utf8");
    expect(kept).toBe("keep");
    await expect(stat(path.join(storage.storageDir, "plug", "1.0.0", "rules", "ok.md"))).rejects.toThrow();
  });

  it("отклоняет небезопасный slug", async () => {
    await expect(writeVersionFiles("../evil", "1.0.0", [])).rejects.toBeInstanceOf(PathTraversalError);
  });

  it("readVersionFiles возвращает содержимое вместе с расположением, сохраняя порядок", async () => {
    await writeVersionFiles("plug", "1.0.0", [
      { component: "rules", ai: null, relativePath: "a.md", content: Buffer.from("A") },
      { component: "agents", ai: "codex", relativePath: "b.md", content: Buffer.from("B") },
    ]);

    const result = await readVersionFiles("plug", "1.0.0", [
      { component: "agents", ai: "codex", relativePath: "b.md" },
      { component: "rules", ai: null, relativePath: "a.md" },
    ]);

    expect(result).toEqual([
      { component: "agents", ai: "codex", relativePath: "b.md", content: Buffer.from("B") },
      { component: "rules", ai: null, relativePath: "a.md", content: Buffer.from("A") },
    ]);
  });

  it("readVersionFiles с пустым списком возвращает пустой массив", async () => {
    await expect(readVersionFiles("plug", "1.0.0", [])).resolves.toEqual([]);
  });

  it("readVersionFiles бросает PathTraversalError на небезопасном пути", async () => {
    await expect(
      readVersionFiles("plug", "1.0.0", [{ component: "rules", ai: null, relativePath: "../../x" }]),
    ).rejects.toBeInstanceOf(PathTraversalError);
  });

  it("readVersionFiles пробрасывает ENOENT для отсутствующего файла", async () => {
    await mkdir(path.join(storage.storageDir, "plug", "1.0.0"), { recursive: true });
    await writeFile(path.join(storage.storageDir, "plug", "1.0.0", "stub"), "");
    await expect(
      readVersionFiles("plug", "1.0.0", [{ component: "rules", ai: null, relativePath: "missing.md" }]),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
