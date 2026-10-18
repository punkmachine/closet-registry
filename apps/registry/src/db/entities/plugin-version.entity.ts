import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Plugin } from "./plugin.entity.js";
import { PluginFile } from "./plugin-file.entity.js";
import type { User } from "./user.entity.js";

/**
 *
 */
@Entity({ name: "plugin_versions" })
@Unique(["plugin", "version"])
export class PluginVersion {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @ManyToOne("Plugin", (plugin: Plugin) => plugin.versions, { nullable: false })
  @Index()
  declare plugin: Plugin;

  @Column({ type: "text" })
  declare version: string;

  @Column({ type: "text", nullable: true })
  declare changelog: string | null;

  @Column({ type: "boolean", default: false })
  declare deleted: boolean;

  @Column({ type: "timestamptz", nullable: true })
  declare deletedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  declare createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  declare updatedAt: Date;

  @ManyToOne("User", { nullable: false, onDelete: "RESTRICT" })
  declare createdBy: User;

  @ManyToOne("User", { nullable: false, onDelete: "RESTRICT" })
  declare updatedBy: User;

  @OneToMany(
    () => PluginFile,
    (file) => file.version,
  )
  declare files: PluginFile[];
}
