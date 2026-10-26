import { HARNESS_IDS, type HarnessId } from "@closet/contract";
import { parse } from "yaml";
import { SpecError } from "./errors.js";

/**
 * Нейтральный источник агента: общие поля, тело промпта и необязательные harness-специфичные поля.
 */
export interface AgentSpec {
  name: string;
  description: string;
  /** Цели из frontmatter; в реестре приоритетнее `targets` файла из метаданных. */
  targets?: HarnessId[];
  body: string;
  /** Поля из блоков `claude-code:` / `codex:`, пробрасываются в результат как есть. */
  overrides: Partial<Record<HarnessId, Record<string, unknown>>>;
}

const BOM = String.fromCodePoint(65_279);
const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const NEUTRAL_KEYS = new Set<string>(["name", "description", "targets", ...HARNESS_IDS]);
const FRONTMATTER_PATTERN = /^---[^\S\n]*\n([\s\S]*?)\n---[^\S\n]*(?:\n|$)/;

/**
 *
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHarnessId(value: unknown): value is HarnessId {
  return (HARNESS_IDS as readonly unknown[]).includes(value);
}

function parseTargets(value: unknown): HarnessId[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SpecError("targets: ожидается непустой список harness'ов");
  }

  const targets: HarnessId[] = [];

  for (const item of value as unknown[]) {
    if (!isHarnessId(item)) {
      throw new SpecError(
        `targets: неизвестный harness ${JSON.stringify(item)} (допустимы: ${HARNESS_IDS.join(", ")})`,
      );
    }

    targets.push(item);
  }

  return targets;
}

/**
 * Делит Markdown на YAML-frontmatter и тело.
 *
 * @param text - Markdown, начинающийся с блока `--- … ---`
 * @returns frontmatter как объект и тело без ведущих пустых строк
 * @throws {SpecError} если frontmatter отсутствует или не является YAML-объектом
 */
export function readFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const normalized = (text.startsWith(BOM) ? text.slice(BOM.length) : text).replaceAll("\r\n", "\n");
  const match = FRONTMATTER_PATTERN.exec(normalized);

  if (!match) {
    throw new SpecError("Нет frontmatter: файл должен начинаться с блока --- … ---");
  }

  let data: unknown;

  try {
    data = parse(match[1] ?? "");
  } catch (error) {
    throw new SpecError(`Невалидный YAML во frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isPlainObject(data)) {
    throw new SpecError("Frontmatter должен быть YAML-объектом");
  }

  return { data, body: normalized.slice(match[0].length).replace(/^\n+/, "").trimEnd() };
}

/**
 * Разбирает нейтральный источник агента.
 *
 * @param text - Markdown с frontmatter (`name`, `description`, необязательные `targets`, `claude-code`, `codex`)
 * @returns разобранный spec
 * @throws {SpecError} если frontmatter отсутствует, невалиден или содержит неизвестные поля
 */
export function parseSpec(text: string): AgentSpec {
  const { data, body } = readFrontmatter(text);

  const unknownKeys = Object.keys(data).filter((key) => !NEUTRAL_KEYS.has(key));

  if (unknownKeys.length > 0) {
    throw new SpecError(
      `Неизвестные поля во frontmatter: ${unknownKeys.join(", ")}. Специфичные для harness'а поля — только в блоках ${HARNESS_IDS.join(", ")}`,
    );
  }

  const { name, description } = data;

  if (typeof name !== "string" || !NAME_PATTERN.test(name) || name.includes("..") || name.length > 64) {
    throw new SpecError("name: обязателен, только [a-z0-9._-], первый символ — буква или цифра, до 64 символов");
  }

  if (typeof description !== "string" || description.trim() === "") {
    throw new SpecError("description: обязательная непустая строка");
  }

  const overrides: AgentSpec["overrides"] = {};

  for (const harness of HARNESS_IDS) {
    const block = data[harness];

    if (block === undefined || block === null) {
      continue;
    }

    if (!isPlainObject(block)) {
      throw new SpecError(`${harness}: ожидается объект с полями harness'а`);
    }

    for (const reserved of ["name", "description"]) {
      if (Object.hasOwn(block, reserved)) {
        throw new SpecError(`${harness}.${reserved}: поле задаётся на верхнем уровне`);
      }
    }

    overrides[harness] = block;
  }

  const spec: AgentSpec = {
    name,
    description,
    body,
    overrides,
  };

  if (data.targets !== undefined) {
    spec.targets = parseTargets(data.targets);
  }

  return spec;
}
