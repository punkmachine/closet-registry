import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Plugin } from "./plugin.entity.js";

@Entity({ name: "plugin_dependencies" })
export class PluginDependency {
  @PrimaryColumn({ type: "bigint" })
  declare pluginId: string;

  @PrimaryColumn({ type: "bigint" })
  declare dependsOnPluginId: string;

  @ManyToOne(() => Plugin, (plugin) => plugin.dependencies, { nullable: false })
  @JoinColumn({ name: "plugin_id" })
  @Index()
  declare plugin: Plugin;

  @ManyToOne(() => Plugin, (plugin) => plugin.dependents, { nullable: false })
  @JoinColumn({ name: "depends_on_plugin_id" })
  @Index()
  declare dependsOn: Plugin;
}
