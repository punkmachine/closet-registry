import { HARNESS_IDS, type HarnessId } from "@closet/contract";
import { parse, stringify } from "yaml";
import { SpecError } from "./errors.js";
import { isPlainObject, parseSpec, readFrontmatter } from "./spec.js";

/**
 * Поля формы «универсальный элемент»: нейтральные поля, тело и YAML-текст harness-блоков.
 */
export interface SpecDraft {
  name: string;
  description: string;
  body: string;
  /** YAML-объект с дополнительными полями harness'а; пустая строка — блока нет. */
  extras: Record<HarnessId, string>;
}

/**
 * @returns пустой черновик
 */
export function emptyDraft(): SpecDraft {
  return { name: "", description: "", body: "", extras: { "claude-code": "", codex: "" } };
}

function parseExtras(harness: HarnessId, yamlText: string): Record<string, unknown> | undefined {
  if (yamlText.trim() === "") {
    return undefined;
  }

  let value: unknown;

  try {
    value = parse(yamlText);
  } catch (error) {
    throw new SpecError(`${harness}: невалидный YAML — ${error instanceof Error ? error.message : String(error)}`);
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new SpecError(`${harness}: ожидается YAML-объект с полями harness'а`);
  }

  return value;
}

/**
 * Собирает текст spec-файла (Markdown + frontmatter) из черновика. Цели в текст не попадают: они хранятся
 * в метаданных файла.
 *
 * @param draft - поля формы
 * @returns текст, который разбирается `parseSpec`
 * @throws {SpecError} если поля не проходят проверку `parseSpec` или YAML блока harness'а невалиден
 */
export function draftToText(draft: SpecDraft): string {
  const frontmatter: Record<string, unknown> = { name: draft.name.trim(), description: draft.description.trim() };

  for (const harness of HARNESS_IDS) {
    const extras = parseExtras(harness, draft.extras[harness]);

    if (extras) {
      frontmatter[harness] = extras;
    }
  }

  const text = `---\n${stringify(frontmatter)}---\n\n${draft.body.trimEnd()}\n`;

  parseSpec(text);

  return text;
}

/**
 * Разбирает текст spec-файла в черновик для формы.
 *
 * @throws {SpecError} если текст не является валидным spec
 */
export function textToDraft(text: string): SpecDraft {
  const spec = parseSpec(text);
  const draft = emptyDraft();

  draft.name = spec.name;
  draft.description = spec.description;
  draft.body = spec.body;

  for (const harness of HARNESS_IDS) {
    const block = spec.overrides[harness];

    draft.extras[harness] = block ? stringify(block).trimEnd() : "";
  }

  return draft;
}

/**
 * Импортирует обычный файл агента Claude Code (`.claude/agents/*.md`) в черновик: `name` и `description`
 * становятся нейтральными полями, остальные поля frontmatter (`tools`, `model`, …) — блоком `claude-code`.
 *
 * @param text - содержимое файла агента
 * @param fallbackName - имя, если во frontmatter нет `name` (обычно имя файла без расширения)
 * @throws {SpecError} если frontmatter отсутствует или невалиден
 */
export function importAgentMarkdown(text: string, fallbackName = ""): SpecDraft {
  const { data, body } = readFrontmatter(text);
  const rest = Object.fromEntries(
    Object.entries(data).filter(([key]) => key !== "name" && key !== "description" && key !== "targets"),
  );
  const draft = emptyDraft();

  draft.name = typeof data.name === "string" ? data.name : fallbackName;
  draft.description = typeof data.description === "string" ? data.description : "";
  draft.body = body;
  draft.extras["claude-code"] = Object.keys(rest).length > 0 ? stringify(rest).trimEnd() : "";

  return draft;
}
