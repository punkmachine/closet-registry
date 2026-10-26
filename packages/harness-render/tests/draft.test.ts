import { describe, expect, it } from "vitest";

import { draftToText, emptyDraft, importAgentMarkdown, parseSpec, SpecError, textToDraft } from "../src/index.js";

describe("draftToText / textToDraft", () => {
  it("собирает spec, который разбирается parseSpec, и возвращает те же поля обратно", () => {
    const draft = {
      name: "reviewer",
      description: "Ревьюит диффы",
      body: "Ты — ревьюер.",
      extras: { "claude-code": "model: sonnet", codex: "model_reasoning_effort: high" },
    };

    const text = draftToText(draft);

    expect(parseSpec(text).overrides).toEqual({
      "claude-code": { model: "sonnet" },
      codex: { model_reasoning_effort: "high" },
    });
    expect(textToDraft(text)).toEqual(draft);
  });

  it("пропускает пустые harness-блоки", () => {
    const text = draftToText({ ...emptyDraft(), name: "a", description: "d", body: "x" });

    expect(parseSpec(text).overrides).toEqual({});
  });

  it.each([
    ["невалидное имя", { name: "../evil" }, "name:"],
    ["пустое описание", { description: " " }, "description:"],
    ["битый YAML", { extras: { "claude-code": "a: [", codex: "" } }, "claude-code: невалидный YAML"],
    ["YAML не объект", { extras: { "claude-code": "- a", codex: "" } }, "ожидается YAML-объект"],
  ])("SpecError: %s", (_title, patch, text) => {
    const draft = { ...emptyDraft(), name: "a", description: "d", body: "x", ...patch };

    expect(() => draftToText(draft)).toThrow(SpecError);
    expect(() => draftToText(draft)).toThrow(text);
  });
});

describe("importAgentMarkdown", () => {
  it("name/description — нейтральные, остальное уходит в блок claude-code", () => {
    const draft = importAgentMarkdown("---\nname: helper\ndescription: Помогает\ntools: Read, Grep\n---\nТело\n");

    expect(draft).toMatchObject({ name: "helper", description: "Помогает", body: "Тело" });
    expect(draft.extras["claude-code"]).toBe("tools: Read, Grep");
    expect(draft.extras.codex).toBe("");
  });

  it("берёт имя из fallbackName, если во frontmatter его нет", () => {
    expect(importAgentMarkdown("---\ndescription: d\n---\nx", "from-file").name).toBe("from-file");
  });

  it("SpecError без frontmatter", () => {
    expect(() => importAgentMarkdown("просто текст")).toThrow(SpecError);
  });
});
