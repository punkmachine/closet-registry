import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { PluginDependency } from "./plugin-dependency.entity.js";
import { PluginVersion } from "./plugin-version.entity.js";

@Entity({ name: "plugins" })
export class Plugin {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @Column({ type: "text", unique: true })
  declare slug: string;

  @Column({ type: "text" })
  declare description: string;

  @Column({ type: "boolean", default: false })
  declare deleted: boolean;

  @Column({ type: "timestamptz", nullable: true })
  declare deletedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  declare createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  declare updatedAt: Date;

  @OneToMany(() => PluginVersion, (version) => version.plugin)
  declare versions: PluginVersion[];

  @OneToMany(() => PluginDependency, (dependency) => dependency.plugin)
  declare dependencies: PluginDependency[];

  @OneToMany(() => PluginDependency, (dependency) => dependency.dependsOn)
  declare dependents: PluginDependency[];
}
