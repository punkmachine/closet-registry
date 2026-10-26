import { createHash } from "node:crypto";
import type { HarnessId, PluginComponent, PluginFileAi } from "@closet/contract";
import { parseSpec, renderSpec } from "@closet/harness-render";

/**
 * Файл, сгенерированный из spec под один harness.
 */
export interface GeneratedFile {
  component: PluginComponent;
  ai: HarnessId;
  relativePath: string;
  content: Buffer;
}

/**
 * Ключ файла в bundle: по нему raw-файл переопределяет сгенерированный.
 */
export function bundleFileKey(component: PluginComponent, ai: PluginFileAi | null, relativePath: string): string {
  return `${component}::${ai ?? ""}::${relativePath}`;
}

/**
 * Разворачивает spec-файл в файлы по целям.
 *
 * @param component - компонент spec-файла
 * @param targets - цели из метаданных файла (приоритетнее `targets` во frontmatter)
 * @param content - содержимое spec-файла
 * @returns по одному файлу на цель
 * @throws {SpecError} если spec не разбирается или не выражается в формате цели
 */
export function generateFromSpec(component: PluginComponent, targets: HarnessId[], content: Buffer): GeneratedFile[] {
  const spec = parseSpec(content.toString("utf8"));

  return targets.map((target) => {
    const rendered = renderSpec(spec, target);

    return {
      component,
      ai: target,
      relativePath: rendered.relativePath,
      content: Buffer.from(rendered.content, "utf8"),
    };
  });
}

/**
 * @returns sha256 содержимого в hex
 */
export function sha256Hex(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export { SpecError } from "@closet/harness-render";
