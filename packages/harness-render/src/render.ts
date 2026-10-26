import type { HarnessId } from "@closet/contract";
import { stringify } from "yaml";
import { SpecError } from "./errors.js";
import type { AgentSpec } from "./spec.js";
import { tomlKey, tomlMultilineString, tomlString, tomlValue } from "./toml.js";

/**
 * Результат рендера: путь относительно папки компонента у harness'а и содержимое файла.
 */
export interface RenderedFile {
  relativePath: string;
  content: string;
}

function renderClaudeCodeAgent(spec: AgentSpec): RenderedFile {
  const frontmatter = stringify({ name: spec.name, description: spec.description, ...spec.overrides["claude-code"] });

  return { relativePath: `${spec.name}.md`, content: `---\n${frontmatter}---\n\n${spec.body}\n` };
}

function renderCodexAgent(spec: AgentSpec): RenderedFile {
  const lines = [`name = ${tomlString(spec.name)}`, `description = ${tomlString(spec.description)}`];

  const extras = Object.entries(spec.overrides.codex ?? {});

  for (const [key, value] of extras) {
    if (key === "developer_instructions") {
      throw new SpecError("codex.developer_instructions: поле формируется из тела файла");
    }

    lines.push(`${tomlKey(key)} = ${tomlValue(value, `codex.${key}`)}`);
  }

  lines.push(`developer_instructions = ${tomlMultilineString(spec.body)}`);

  return { relativePath: `${spec.name}.toml`, content: `${lines.join("\n")}\n` };
}

/**
 * Рендерит файл агента под harness: `claude-code` → `<name>.md` (frontmatter + тело), `codex` → `<name>.toml`.
 *
 * @param spec - разобранный нейтральный источник
 * @param harness - целевой harness
 * @returns относительный путь и содержимое
 * @throws {SpecError} если поля harness-блока нельзя выразить в целевом формате
 */
export function renderSpec(spec: AgentSpec, harness: HarnessId): RenderedFile {
  switch (harness) {
    case "claude-code": {
      return renderClaudeCodeAgent(spec);
    }
    case "codex": {
      return renderCodexAgent(spec);
    }
  }
}
