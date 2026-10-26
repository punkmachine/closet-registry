import { describe, expect, it } from "vitest";

import { parseSpec, renderSpec, SpecError } from "../src/index.js";

const SPEC = `---
name: reviewer
description: Ревьюит диффы на баги
targets: [claude-code, codex]
claude-code:
  tools: Read, Grep
  model: sonnet
codex:
  model_reasoning_effort: high
---
Ты — строгий ревьюер.

Ищи баги.
`;

describe("parseSpec", () => {
  it("разбирает нейтральные поля, цели, harness-блоки и тело", () => {
    expect(parseSpec(SPEC)).toEqual({
      name: "reviewer",
      description: "Ревьюит диффы на баги",
      targets: ["claude-code", "codex"],
      body: "Ты — строгий ревьюер.\n\nИщи баги.",
      overrides: { "claude-code": { tools: "Read, Grep", model: "sonnet" }, codex: { model_reasoning_effort: "high" } },
    });
  });

  it("понимает CRLF и BOM", () => {
    const spec = parseSpec(`\u{FEFF}${SPEC.replaceAll("\n", "\r\n")}`);

    expect(spec.name).toBe("reviewer");
    expect(spec.body).toBe("Ты — строгий ревьюер.\n\nИщи баги.");
  });

  it("targets необязательны", () => {
    expect(parseSpec("---\nname: a\ndescription: d\n---\nтело").targets).toBeUndefined();
  });

  it.each([
    ["нет frontmatter", "просто текст", "Нет frontmatter"],
    ["невалидный YAML", "---\nname: [\n---\nx", "Невалидный YAML"],
    ["frontmatter не объект", "---\n- a\n---\nx", "YAML-объектом"],
    ["неизвестное верхнеуровневое поле", "---\nname: a\ndescription: d\ntools: Read\n---\nx", "Неизвестные поля"],
    ["нет name", "---\ndescription: d\n---\nx", "name:"],
    ["name с path traversal", "---\nname: ../evil\ndescription: d\n---\nx", "name:"],
    ["name с '..' внутри", "---\nname: a..b\ndescription: d\n---\nx", "name:"],
    ["нет description", "---\nname: a\n---\nx", "description:"],
    ["пустой description", "---\nname: a\ndescription: '  '\n---\nx", "description:"],
    ["неизвестная цель", "---\nname: a\ndescription: d\ntargets: [cursor]\n---\nx", "неизвестный harness"],
    ["пустые цели", "---\nname: a\ndescription: d\ntargets: []\n---\nx", "targets:"],
    ["блок harness'а не объект", "---\nname: a\ndescription: d\ncodex: 1\n---\nx", "codex:"],
    ["name в блоке harness'а", "---\nname: a\ndescription: d\ncodex:\n  name: b\n---\nx", "codex.name"],
  ])("%s -> SpecError", (_title, text, message) => {
    expect(() => parseSpec(text)).toThrow(SpecError);
    expect(() => parseSpec(text)).toThrow(message);
  });
});

describe("renderSpec", () => {
  const spec = parseSpec(SPEC);

  it("claude-code: <name>.md с frontmatter и телом", () => {
    expect(renderSpec(spec, "claude-code")).toEqual({
      relativePath: "reviewer.md",
      content:
        "---\nname: reviewer\ndescription: Ревьюит диффы на баги\ntools: Read, Grep\nmodel: sonnet\n---\n\nТы — строгий ревьюер.\n\nИщи баги.\n",
    });
  });

  it("codex: <name>.toml с developer_instructions и полями из блока codex", () => {
    expect(renderSpec(spec, "codex")).toEqual({
      relativePath: "reviewer.toml",
      content:
        'name = "reviewer"\ndescription = "Ревьюит диффы на баги"\nmodel_reasoning_effort = "high"\ndeveloper_instructions = """\nТы — строгий ревьюер.\n\nИщи баги.\n"""\n',
    });
  });

  it("description с двоеточием и кавычками остаётся валидным YAML", () => {
    const tricky = parseSpec('---\nname: a\ndescription: "Проверяет: \\"x\\" # не комментарий"\n---\nтело');
    const rendered = renderSpec(tricky, "claude-code").content;

    expect(parseSpec(rendered).description).toBe('Проверяет: "x" # не комментарий');
  });

  it("codex: экранирует бэкслеши, тройные кавычки и управляющие символы в теле", () => {
    const tricky = { ...spec, body: 'путь C:\\dir """ конец\tтаб\u{1}' };
    const { content } = renderSpec(tricky, "codex");

    expect(content).toContain(String.raw`путь C:\\dir ""\" конец\tтаб\u${"0001"}`);
  });

  it("codex: массивы, числа, булевы и вложенные объекты из блока codex", () => {
    const rich = parseSpec(
      "---\nname: a\ndescription: d\ncodex:\n  list: [1, two]\n  flag: true\n  nested:\n    k: 1.5\n  'odd key': x\n---\nтело",
    );
    const { content } = renderSpec(rich, "codex");

    expect(content).toContain('list = [1, "two"]\nflag = true\nnested = { k = 1.5 }\n"odd key" = "x"\n');
  });

  it("codex: null и developer_instructions в блоке -> SpecError", () => {
    const withNull = parseSpec("---\nname: a\ndescription: d\ncodex:\n  x: ~\n---\nтело");
    const withInstructions = parseSpec("---\nname: a\ndescription: d\ncodex:\n  developer_instructions: z\n---\nтело");

    expect(() => renderSpec(withNull, "codex")).toThrow("codex.x");
    expect(() => renderSpec(withInstructions, "codex")).toThrow("developer_instructions");
  });

  it("claude-code не затрагивается блоком codex и наоборот", () => {
    expect(renderSpec(spec, "claude-code").content).not.toContain("model_reasoning_effort");
    expect(renderSpec(spec, "codex").content).not.toContain("sonnet");
  });
});
