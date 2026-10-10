import type { PluginPublishMetadata } from "@closet/contract";
import { describe, expect, it, vi } from "vitest";
import {
  buildFormData,
  classifyPath,
  emptyTextFormFile,
  type FormFile,
  guessComponentByFileName,
  type PluginFormValues,
  suggestMergeKeyPath,
  validateForm,
} from "~/utils/plugin-files";

describe("classifyPath", () => {
  it.each([
    ["rules/a.md", "rules"],
    ["rule/a.md", "rules"],
    ["memories/a.md", "rules"],
    ["hooks/a.sh", "hooks"],
    ["hook/a.sh", "hooks"],
    ["agents/a.md", "agents"],
    ["agent/a.md", "agents"],
    ["subagents/a.md", "agents"],
    ["commands/a.md", "commands"],
    ["command/a.md", "commands"],
    ["skills/a.md", "skills"],
    ["skill/a.md", "skills"],
    ["scripts/a.sh", "scripts"],
    ["script/a.sh", "scripts"],
    ["bin/a.sh", "scripts"],
    ["mcp/a.json", "mcp"],
  ])("алиас каталога %s -> компонент %s, каталог вырезан из relativePath", (path, component) => {
    const result = classifyPath(path);
    expect(result.component).toBe(component);
    expect(result.relativePath).toBe(path.split("/", 2)[1]);
  });

  it("регистр сегментов не важен", () => {
    expect(classifyPath("Hooks/foo.sh")).toEqual({ component: "hooks", ai: null, relativePath: "foo.sh" });
  });

  it.each([
    ["codex/rules/a.md", "codex"],
    ["claude-code/rules/a.md", "claude-code"],
    ["claude/rules/a.md", "claude-code"],
    [".claude/rules/a.md", "claude-code"],
    [".codex/rules/a.md", "codex"],
  ])("алиас ИИ %s -> ai %s, вырезан из relativePath", (path, ai) => {
    expect(classifyPath(path)).toEqual({ component: "rules", ai, relativePath: "a.md" });
  });

  it("component и ai вырезаются из relativePath (нет hooks/hooks/foo.sh)", () => {
    expect(classifyPath(".claude/hooks/foo.sh")).toEqual({
      component: "hooks",
      ai: "claude-code",
      relativePath: "foo.sh",
    });
  });

  it("ai может стоять перед или после компонента", () => {
    expect(classifyPath("hooks/codex/foo.sh")).toEqual({ component: "hooks", ai: "codex", relativePath: "foo.sh" });
  });

  it("вложенные подкаталоги сохраняются", () => {
    expect(classifyPath("skills/my-skill/docs/readme.md")).toEqual({
      component: "skills",
      ai: null,
      relativePath: "my-skill/docs/readme.md",
    });
  });

  it("второй одноимённый сегмент не вырезается (компонент уже найден)", () => {
    expect(classifyPath("hooks/hooks/foo.sh")).toEqual({ component: "hooks", ai: null, relativePath: "hooks/foo.sh" });
  });

  it("последний сегмент не съедается как компонент или ai", () => {
    expect(classifyPath("rules/hooks")).toEqual({ component: "rules", ai: null, relativePath: "hooks" });
    expect(classifyPath("rules/codex")).toEqual({ component: "rules", ai: null, relativePath: "codex" });
    expect(classifyPath("hooks/rules")).toEqual({ component: "hooks", ai: null, relativePath: "rules" });
  });

  it("обратные слэши Windows", () => {
    expect(classifyPath(String.raw`claude-code\agents\sub\a.md`)).toEqual({
      component: "agents",
      ai: "claude-code",
      relativePath: "sub/a.md",
    });
  });

  it("точечные сегменты и двойные слэши отбрасываются", () => {
    expect(classifyPath("./rules//a.md")).toEqual({ component: "rules", ai: null, relativePath: "a.md" });
  });

  it("путь из одного файла: компонент угадывается по имени", () => {
    expect(classifyPath("run.sh")).toEqual({ component: "scripts", ai: null, relativePath: "run.sh" });
    expect(classifyPath("notes.md")).toEqual({ component: "rules", ai: null, relativePath: "notes.md" });
    expect(classifyPath("mcp.json")).toEqual({ component: "mcp", ai: null, relativePath: "mcp.json" });
  });

  it("единственный сегмент-алиас — это имя файла, а не компонент", () => {
    expect(classifyPath("skills")).toEqual({ component: "rules", ai: null, relativePath: "skills" });
  });

  it("сегменты вроде constructor не находятся в прототипе словаря", () => {
    expect(classifyPath("constructor/a.md")).toEqual({
      component: "rules",
      ai: null,
      relativePath: "constructor/a.md",
    });
    expect(classifyPath("toString/a.md").relativePath).toBe("toString/a.md");
  });

  it("если компонент не найден в пути, используется угадывание по имени файла", () => {
    expect(classifyPath("tools/run.py")).toEqual({ component: "scripts", ai: null, relativePath: "tools/run.py" });
  });
});

describe("guessComponentByFileName", () => {
  it.each(["mcp.json", ".mcp.json", "MCP.JSON", "server.mcp.json"])("%s -> mcp", (name) => {
    expect(guessComponentByFileName(name)).toBe("mcp");
  });

  it.each(["a.sh", "a.py", "a.mjs", "a.js", "A.SH"])("%s -> scripts", (name) => {
    expect(guessComponentByFileName(name)).toBe("scripts");
  });

  it.each(["settings.json", "my-hooks.md", "PreHook.md"])("%s -> hooks", (name) => {
    expect(guessComponentByFileName(name)).toBe("hooks");
  });

  it.each(["README.md", "notes.txt", "data.json"])("%s -> rules (дефолт)", (name) => {
    expect(guessComponentByFileName(name)).toBe("rules");
  });

  it("скрипт с hook в имени остаётся scripts (расширение проверяется раньше)", () => {
    expect(guessComponentByFileName("pre-hook.sh")).toBe("scripts");
  });
});

describe("suggestMergeKeyPath", () => {
  it("mcp -> mcpServers.<имя файла без расширения>", () => {
    expect(suggestMergeKeyPath("mcp", "dir/my server.json")).toBe("mcpServers.my-server");
  });

  it("hooks -> фиксированный слот", () => {
    expect(suggestMergeKeyPath("hooks", "settings.json")).toBe("hooks.PostToolUse[]");
  });

  it("остальные -> имя слота; пустое имя -> closet", () => {
    expect(suggestMergeKeyPath("rules", "a/b.md")).toBe("b");
    expect(suggestMergeKeyPath("rules", "///")).toBe("closet");
  });
});

function makeFile(overrides: Partial<FormFile> = {}): FormFile {
  return { ...emptyTextFormFile(), relativePath: "a.md", text: "hello", ...overrides };
}

function makeValues(overrides: Partial<PluginFormValues> = {}): PluginFormValues {
  return {
    slug: "demo",
    description: "desc",
    version: "1.0.0",
    changelog: "",
    dependencies: [],
    files: [makeFile()],
    ...overrides,
  };
}

describe("validateForm", () => {
  it("валидная форма -> нет ошибок", () => {
    expect(validateForm(makeValues(), { requireSlug: true })).toEqual([]);
  });

  it("slug проверяется только при requireSlug", () => {
    const values = makeValues({ slug: "Bad Slug" });
    expect(validateForm(values, { requireSlug: true })).toHaveLength(1);
    expect(validateForm(values, { requireSlug: false })).toEqual([]);
  });

  it("невалидная версия и пустой список файлов", () => {
    const errors = validateForm(makeValues({ version: "latest", files: [] }), { requireSlug: false });
    expect(errors).toHaveLength(2);
  });

  it("абсолютный путь и .. отклоняются", () => {
    const errors = validateForm(makeValues({ files: [makeFile({ relativePath: "/etc/passwd" })] }), {
      requireSlug: false,
    });
    expect(errors.some((e) => e.includes("/etc/passwd"))).toBe(true);
    const errors2 = validateForm(makeValues({ files: [makeFile({ relativePath: "../x" })] }), { requireSlug: false });
    expect(errors2).toHaveLength(1);
  });

  it("merge без mergeKeyPath и дубли файлов", () => {
    const errors = validateForm(
      makeValues({
        files: [makeFile({ merge: true, mergeKeyPath: "  " }), makeFile({ merge: true, mergeKeyPath: "" })],
      }),
      { requireSlug: false },
    );
    expect(errors.some((e) => e.includes("mergeKeyPath"))).toBe(true);
    expect(errors.some((e) => e.startsWith("Дубль файла"))).toBe(true);
  });

  it("пустой путь файла", () => {
    expect(validateForm(makeValues({ files: [makeFile({ relativePath: " " })] }), { requireSlug: false })).toEqual([
      "У каждого файла должен быть путь",
    ]);
  });
});

describe("buildFormData", () => {
  const fieldName = (file: Pick<FormFile, "component" | "ai" | "relativePath">) =>
    `${file.component}::${file.ai ?? ""}::${file.relativePath}`;

  function parseMetadata(formData: FormData): PluginPublishMetadata {
    const raw = formData.get("metadata");
    expect(typeof raw).toBe("string");
    return JSON.parse(raw as string) as PluginPublishMetadata;
  }

  it("кладёт metadata и по одной части на файл", async () => {
    const values = makeValues({
      files: [
        makeFile({ component: "hooks", ai: "claude-code", relativePath: "sub/foo.sh", text: "echo 1" }),
        makeFile({ component: "rules", ai: null, relativePath: "a.md", text: "rule" }),
      ],
    });
    const formData = buildFormData(values);

    expect([...formData.keys()].toSorted()).toEqual(
      ["metadata", "hooks::claude-code::sub/foo.sh", "rules::::a.md"].toSorted(),
    );

    const part = formData.get("hooks::claude-code::sub/foo.sh") as Blob;
    expect(await part.text()).toBe("echo 1");
  });

  it("ключи файлов соответствуют ключам, которые реестр строит из metadata", () => {
    const values = makeValues({
      files: [
        makeFile({ component: "hooks", ai: "codex", relativePath: "h.sh" }),
        makeFile({ component: "mcp", ai: null, relativePath: "mcp.json" }),
        makeFile({ component: "skills", ai: "claude-code", relativePath: "s/SKILL.md" }),
      ],
    });
    const formData = buildFormData(values);
    const metadata = parseMetadata(formData);

    expect(metadata.files).toHaveLength(values.files.length);
    for (const file of metadata.files) {
      // та же формула, что buildFileKey в apps/registry/src/routes/admin-plugins.ts
      expect(formData.has(`${file.component}::${file.ai ?? ""}::${file.relativePath}`)).toBe(true);
    }
    expect(formData.has(fieldName({ component: "mcp", ai: null, relativePath: "mcp.json" }))).toBe(true);
  });

  it("бинарный файл уходит байтами как есть", async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01]);
    const formData = buildFormData(
      makeValues({
        files: [makeFile({ relativePath: "img.bin", kind: "binary", bytes, text: "", sizeBytes: bytes.length })],
      }),
    );
    const part = formData.get("rules::::img.bin") as File;
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([...bytes]);
  });

  it("mergeKeyPath попадает в metadata только для merge-файлов, с trim", () => {
    const metadata = parseMetadata(
      buildFormData(
        makeValues({
          files: [
            makeFile({ relativePath: "a.json", merge: true, mergeKeyPath: "  mcpServers.x  " }),
            makeFile({ relativePath: "b.md", merge: false, mergeKeyPath: "ignored" }),
          ],
        }),
      ),
    );
    expect(metadata.files[0]?.mergeKeyPath).toBe("mcpServers.x");
    expect(metadata.files[1]).not.toHaveProperty("mergeKeyPath");
  });

  it("changelog добавляется только непустой (с trim)", () => {
    expect(parseMetadata(buildFormData(makeValues({ changelog: " ".repeat(3) })))).not.toHaveProperty("changelog");
    expect(parseMetadata(buildFormData(makeValues({ changelog: " fix " }))).changelog).toBe("fix");
  });

  it("поля формы (slug, version, dependencies, флаги) попадают в metadata; id и текст — нет", () => {
    const metadata = parseMetadata(
      buildFormData(
        makeValues({
          dependencies: ["dep-a"],
          files: [makeFile({ rootPath: true, template: true })],
        }),
      ),
    );
    expect(metadata).toMatchObject({ slug: "demo", version: "1.0.0", description: "desc", dependencies: ["dep-a"] });
    expect(metadata.files[0]).toEqual({
      component: "rules",
      ai: null,
      relativePath: "a.md",
      rootPath: true,
      merge: false,
      template: true,
    });
  });

  it("имя части — последний сегмент пути, либо file", () => {
    // happy-dom не переименовывает Blob при append(name, blob, filename), поэтому смотрим на аргументы вызова
    const append = vi.spyOn(FormData.prototype, "append");
    try {
      buildFormData(
        makeValues({
          files: [makeFile({ relativePath: "dir/sub/x.md" }), makeFile({ relativePath: "dir/", text: "" })],
        }),
      );
      const fileNames = append.mock.calls.filter(([key]) => key !== "metadata").map((call) => call[2]);
      expect(fileNames).toEqual(["x.md", "file"]);
    } finally {
      append.mockRestore();
    }
  });
});
