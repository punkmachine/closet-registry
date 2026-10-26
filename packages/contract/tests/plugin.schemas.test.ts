import { describe, expect, it } from "vitest";

import {
  HARNESS_IDS,
  HARNESS_SUPPORT,
  isHarnessSupported,
  PLUGIN_COMPONENTS,
  PLUGIN_FILE_AI_VALUES,
  pluginFileInputSchema,
  pluginPublishMetadataSchema,
  pluginUpdateMetadataSchema,
} from "../src/index.js";

const validFile = { component: "rules", relativePath: "a.md" };
const validPublish = { slug: "demo", description: "d", version: "1.0.0", files: [validFile] };

describe("pluginFileInputSchema", () => {
  it("merge: true без mergeKeyPath -> ошибка на пути mergeKeyPath", () => {
    const result = pluginFileInputSchema.safeParse({ ...validFile, merge: true });
    const paths = result.error?.issues.map((issue) => issue.path.join(".")) ?? [];

    expect(result.success).toBe(false);
    expect(paths).toContain("mergeKeyPath");
  });

  it("merge: true с mergeKeyPath проходит", () => {
    expect(pluginFileInputSchema.safeParse({ ...validFile, merge: true, mergeKeyPath: "mcpServers" }).success).toBe(
      true,
    );
  });
});

describe("pluginPublishMetadataSchema", () => {
  it("пустой массив files -> ошибка", () => {
    const result = pluginPublishMetadataSchema.safeParse({ ...validPublish, files: [] });
    expect(result.success).toBe(false);
  });

  it("применяет дефолты (ai: null, rootPath/merge/template: false, dependencies: [])", () => {
    const result = pluginPublishMetadataSchema.parse(validPublish);
    expect(result.dependencies).toEqual([]);
    expect(result.files[0]).toMatchObject({ ai: null, rootPath: false, merge: false, template: false });
  });
});

describe("pluginUpdateMetadataSchema", () => {
  it("slug и version опциональны", () => {
    const rest = { description: validPublish.description, files: validPublish.files };

    expect(pluginUpdateMetadataSchema.safeParse(rest).success).toBe(true);
  });

  it.each(["description", "files"] as const)("поле %s остаётся обязательным", (key) => {
    const rest = { description: validPublish.description, files: validPublish.files, [key]: undefined };

    expect(pluginUpdateMetadataSchema.safeParse(rest).success).toBe(false);
  });
});

describe("pluginFileInputSchema: format/targets", () => {
  const spec = { component: "agents", relativePath: "reviewer.md", format: "spec", targets: ["claude-code", "codex"] };

  it("по умолчанию format: raw, targets не задан", () => {
    const parsed = pluginFileInputSchema.parse(validFile);

    expect(parsed.format).toBe("raw");
    expect(parsed.targets).toBeUndefined();
  });

  it("корректный spec для agents проходит", () => {
    expect(pluginFileInputSchema.safeParse(spec).success).toBe(true);
  });

  it.each([
    ["raw с targets", { ...validFile, targets: ["codex"] }, "targets"],
    ["spec без targets", { ...spec, targets: undefined }, "targets"],
    ["spec с пустыми targets", { ...spec, targets: [] }, "targets"],
    ["spec с дублем в targets", { ...spec, targets: ["codex", "codex"] }, "targets"],
    ["spec с неизвестной целью", { ...spec, targets: ["cursor"] }, "targets.0"],
    ["spec для не рендерящегося компонента", { ...spec, component: "skills" }, "format"],
    ["spec с ai", { ...spec, ai: "codex" }, "ai"],
    ["spec с merge", { ...spec, merge: true, mergeKeyPath: "x" }, "format"],
  ])("%s -> ошибка", (_title, input, path) => {
    const result = pluginFileInputSchema.safeParse(input);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")) ?? [];

    expect(result.success).toBe(false);
    expect(paths).toContain(path);
  });

  it("матрица: commands × codex не поддерживается, agents × codex — да", () => {
    expect(isHarnessSupported("commands", "codex")).toBe(false);
    expect(isHarnessSupported("agents", "codex")).toBe(true);
  });
});

describe("HARNESS_IDS", () => {
  it("совпадают с PLUGIN_FILE_AI_VALUES", () => {
    expect([...PLUGIN_FILE_AI_VALUES]).toEqual([...HARNESS_IDS]);
  });

  it("матрица покрывает все компоненты и все harness'ы", () => {
    for (const component of PLUGIN_COMPONENTS) {
      expect(Object.keys(HARNESS_SUPPORT[component]).toSorted()).toEqual([...HARNESS_IDS].toSorted());
    }
  });
});
