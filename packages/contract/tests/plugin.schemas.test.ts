import { describe, expect, it } from "vitest";

import { pluginFileInputSchema, pluginPublishMetadataSchema, pluginUpdateMetadataSchema } from "../src/index.js";

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
