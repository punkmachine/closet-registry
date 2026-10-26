import type { HarnessId, PluginComponent, PluginFileAi, PluginFileFormat } from "@closet/contract";
import { Check, Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import type { PluginVersion } from "./plugin-version.entity.js";

/**
 *
 */
@Entity({ name: "plugin_files" })
@Unique(["version", "component", "ai", "relativePath"])
@Check(`"component" IN ('mcp', 'rules', 'hooks', 'agents', 'commands', 'skills', 'scripts')`)
@Check(`"ai" IS NULL OR "ai" IN ('codex', 'claude-code')`)
@Check(`"format" IN ('raw', 'spec')`)
export class PluginFile {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @ManyToOne("PluginVersion", (version: PluginVersion) => version.files, { nullable: false })
  @Index()
  declare version: PluginVersion;

  /** Один из `mcp|rules|hooks|agents|commands|skills|scripts`: text-колонка + CHECK, а не native enum. */
  @Column({ type: "text" })
  declare component: PluginComponent;

  /** `null` — файл общий для всех ИИ; иначе `codex` или `claude-code`. */
  @Column({ type: "text", nullable: true })
  declare ai: PluginFileAi | null;

  @Column({ type: "text" })
  declare relativePath: string;

  @Column({ type: "text" })
  declare storagePath: string;

  @Column({ type: "text" })
  declare sha256: string;

  @Column({ type: "bigint" })
  declare sizeBytes: string;

  @Column({ type: "boolean", default: false })
  declare rootPath: boolean;

  @Column({ type: "boolean", default: false })
  declare merge: boolean;

  @Column({ type: "text", nullable: true })
  declare mergeKeyPath: string | null;

  @Column({ type: "boolean", default: false })
  declare template: boolean;

  /** `raw` — файл отдаётся как есть; `spec` — нейтральный источник, разворачивается в файлы по `targets` при выдаче bundle. */
  @Column({ type: "text", default: "raw" })
  declare format: PluginFileFormat;

  /** Цели `spec`-файла; `null` для `raw`. */
  @Column({ type: "text", array: true, nullable: true })
  declare targets: HarnessId[] | null;

  @CreateDateColumn({ type: "timestamptz" })
  declare createdAt: Date;
}
