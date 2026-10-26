import type { PluginComponent } from "./components.js";

/**
 * Идентификаторы harness'ов (ИИ-инструментов), для которых реестр умеет отдавать файлы.
 * Значения совпадают с именами в `PLUGIN_FILE_AI_VALUES` и в CHECK-ограничении колонки `plugin_files.ai`.
 */
export const HARNESS_IDS = ["claude-code", "codex"] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];

/**
 * Поддержка компонента harness'ом: `supported` — есть куда класть, `unsupported` — у harness'а нет аналога
 * (подтверждено документацией), `not-implemented` — аналог есть, но движка пока нет.
 */
export type ComponentSupport = "supported" | "unsupported" | "not-implemented";

/**
 * Матрица `component × harness`. Источник для чекбоксов целей в админке и валидации `targets`.
 */
export const HARNESS_SUPPORT: Readonly<Record<PluginComponent, Readonly<Record<HarnessId, ComponentSupport>>>> = {
  mcp: { "claude-code": "supported", codex: "supported" },
  rules: { "claude-code": "supported", codex: "not-implemented" },
  hooks: { "claude-code": "supported", codex: "supported" },
  agents: { "claude-code": "supported", codex: "supported" },
  commands: { "claude-code": "supported", codex: "unsupported" },
  skills: { "claude-code": "supported", codex: "supported" },
  scripts: { "claude-code": "supported", codex: "supported" },
};

/**
 * Компоненты, для которых реестр умеет разворачивать нейтральный источник (`format: "spec"`) в файлы harness'ов.
 */
export const SPEC_COMPONENTS = ["agents"] as const satisfies readonly PluginComponent[];
export type SpecComponent = (typeof SPEC_COMPONENTS)[number];

/**
 * @returns `true`, если harness поддерживает компонент
 */
export function isHarnessSupported(component: PluginComponent, harness: HarnessId): boolean {
  return HARNESS_SUPPORT[component][harness] === "supported";
}

/**
 * @returns `true`, если компонент можно хранить как нейтральный источник
 */
export function isSpecComponent(component: PluginComponent): component is SpecComponent {
  return (SPEC_COMPONENTS as readonly PluginComponent[]).includes(component);
}
