import { HARNESS_IDS } from "./harnesses.js";

export const PLUGIN_COMPONENTS = ["mcp", "rules", "hooks", "agents", "commands", "skills", "scripts"] as const;
export type PluginComponent = (typeof PLUGIN_COMPONENTS)[number];

export const PLUGIN_FILE_AI_VALUES = HARNESS_IDS;
export type PluginFileAi = (typeof PLUGIN_FILE_AI_VALUES)[number];

export const PLUGIN_FILE_FORMATS = ["raw", "spec"] as const;
export type PluginFileFormat = (typeof PLUGIN_FILE_FORMATS)[number];
