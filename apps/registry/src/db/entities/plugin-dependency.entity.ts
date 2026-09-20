import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import type { Plugin } from "./plugin.entity.js";

@Entity({ name: "plugin_dependencies" })
export class PluginDependency {
  @PrimaryColumn({ type: "bigint" })
  declare pluginId: string;

  @PrimaryColumn({ type: "bigint" })
  declare dependsOnPluginId: string;

  // Строковое имя сущности, а не () => Plugin: иначе ESM-цикл
  // plugin.entity → plugin-dependency.entity → plugin.entity валит compiled dist
  // (`Cannot access 'Plugin' before initialization`).
  @ManyToOne("Plugin", (plugin: Plugin) => plugin.dependencies, { nullable: false })
  @JoinColumn({ name: "plugin_id" })
  @Index()
  declare plugin: Plugin;

  @ManyToOne("Plugin", (plugin: Plugin) => plugin.dependents, { nullable: false })
  @JoinColumn({ name: "depends_on_plugin_id" })
  @Index()
  declare dependsOn: Plugin;
}
