import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import type { Plugin } from "./plugin.entity.js";
import type { PluginVersion } from "./plugin-version.entity.js";

@Entity({ name: "install_events" })
export class InstallEvent {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @ManyToOne("Plugin", { nullable: false })
  @Index()
  declare plugin: Plugin;

  @ManyToOne("PluginVersion", { nullable: false })
  @Index()
  declare pluginVersion: PluginVersion;

  @Column({ type: "text" })
  declare cliVersion: string;

  @CreateDateColumn({ type: "timestamptz" })
  declare installedAt: Date;
}
