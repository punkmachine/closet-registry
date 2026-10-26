import { SpecError } from "./errors.js";

const BARE_KEY = /^[A-Za-z0-9_-]+$/;
// eslint-disable-next-line no-control-regex -- управляющие символы нужно экранировать в TOML
const CONTROL_CHARS = /[\u{0}-\u{8}\u{B}-\u{1F}\u{7F}]/gu;
// eslint-disable-next-line no-control-regex -- то же, но \n и \t в многострочной строке остаются как есть
const MULTILINE_CONTROL_CHARS = /[\u{0}-\u{8}\u{B}-\u{1F}\u{7F}]/gu;

function escapeControl(char: string): string {
  return String.raw`\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`;
}

/**
 * @returns однострочная basic-строка TOML
 */
export function tomlString(value: string): string {
  const escaped = value
    .replaceAll("\\", String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll("\n", String.raw`\n`)
    .replaceAll("\r", String.raw`\r`)
    .replaceAll("\t", String.raw`\t`)
    .replaceAll(CONTROL_CHARS, (char) => escapeControl(char));

  return `"${escaped}"`;
}

/**
 * @returns ключ TOML: bare, если допустимо, иначе в кавычках
 */
export function tomlKey(key: string): string {
  return BARE_KEY.test(key) ? key : tomlString(key);
}

/**
 * @returns многострочная basic-строка TOML (`"""`) с экранированием `\`, `"""` и управляющих символов
 */
export function tomlMultilineString(value: string): string {
  const escaped = value
    .replaceAll("\r\n", "\n")
    .replaceAll("\\", String.raw`\\`)
    .replaceAll('"""', String.raw`""\"`)
    .replaceAll("\t", String.raw`\t`)
    .replaceAll(MULTILINE_CONTROL_CHARS, (char) => (char === "\n" ? char : escapeControl(char)));

  return `"""\n${escaped}\n"""`;
}

/**
 * Сериализует значение из YAML-блока в TOML-значение: скаляры, массивы и вложенные объекты (inline table).
 *
 * @throws {SpecError} для значений, которые в TOML не выразить (`null`, даты и т.п.)
 */
export function tomlValue(value: unknown, keyPath: string): string {
  if (typeof value === "string") {
    return tomlString(value);
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new SpecError(`${keyPath}: число должно быть конечным`);
    }

    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${(value as unknown[]).map((item, index) => tomlValue(item, `${keyPath}[${String(index)}]`)).join(", ")}]`;
  }

  if (typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value).map(
      ([key, item]) => `${tomlKey(key)} = ${tomlValue(item, `${keyPath}.${key}`)}`,
    );

    return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
  }

  throw new SpecError(`${keyPath}: значение не поддерживается в TOML`);
}
