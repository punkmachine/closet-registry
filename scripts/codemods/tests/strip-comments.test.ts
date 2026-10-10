import { describe, expect, it } from "vitest";
import { stripComments } from "../strip-comments-core.js";

const strip = (source: string, filename = "sample.ts") => stripComments(source, filename).output;

describe("strip-comments: .ts", () => {
  it("удаляет строчные и блочные комментарии, оставляя код", () => {
    const input = ["// шапка", "const a = 1; // хвост", "/* блок */", "const b = 2;", ""].join("\n");
    expect(strip(input)).toBe("const a = 1;\nconst b = 2;\n");
  });

  it("сохраняет JSDoc", () => {
    const input = "/** Описание. */\nexport const a = 1; // лишнее\n";
    expect(strip(input)).toBe("/** Описание. */\nexport const a = 1;\n");
  });

  it("сохраняет директивы линтера, компилятора и сборщика", () => {
    const input = [
      "#!/usr/bin/env node",
      '/// <reference types="node" />',
      "/*! (c) license */",
      "// @ts-expect-error причина",
      "// eslint-disable-next-line no-console -- причина",
      "// biome-ignore lint/style: причина",
      'const n = import(/* @vite-ignore */ "./y.js");',
      "",
    ].join("\n");
    const result = stripComments(input, "directives.ts");
    expect(result.removed).toHaveLength(0);
    expect(result.output).toBe(input);
  });

  it("файл только из комментариев становится пустым", () => {
    expect(strip("// один\n// два\n")).toBe("");
  });

  it("не схлопывает пустые строки вне мест удаления", () => {
    const input = "const a = 1;\n\n\nconst b = 2;\n";
    expect(strip(input)).toBe(input);
  });

  it("не оставляет двойную пустую строку на месте удалённого блока", () => {
    const input = "const a = 1;\n\n// комментарий\n\nconst b = 2;\n";
    expect(strip(input)).toBe("const a = 1;\n\nconst b = 2;\n");
  });

  it("не трогает // внутри строк и шаблонов", () => {
    const input = 'const url = "http://x"; const t = `// не комментарий`;\n';
    expect(strip(input)).toBe(input);
  });

  it("идемпотентен", () => {
    const input = "// a\nconst x = 1; /* b */\n\n// c\n\nexport const y = 2;\n";
    const once = strip(input);
    expect(strip(once)).toBe(once);
  });
});

describe("strip-comments: .vue", () => {
  const sfc = [
    '<script setup lang="ts">',
    "// комментарий скрипта",
    "const a = 1;",
    "</script>",
    "",
    "<template>",
    "  <!-- комментарий шаблона -->",
    '  <div title="a --> b">{{ a }}</div>',
    "</template>",
    "",
    "<style>",
    "/* комментарий стиля */",
    ".a { color: red; }",
    "</style>",
    "",
  ].join("\n");

  it("снимает комментарии в script, template и style", () => {
    const output = strip(sfc, "Sample.vue");
    expect(output).not.toContain("комментарий");
    expect(output).toContain("const a = 1;");
    expect(output).toContain('<div title="a --> b">{{ a }}</div>');
    expect(output).toContain(".a { color: red; }");
  });

  it("идемпотентен", () => {
    const once = strip(sfc, "Sample.vue");
    expect(strip(once, "Sample.vue")).toBe(once);
  });
});
