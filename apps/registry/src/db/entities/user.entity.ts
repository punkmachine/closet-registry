import type { UserRole } from "@closet/contract";
import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

/**
 *
 */
@Entity({ name: "users" })
@Check(`"role" IN ('admin', 'developer', 'guest')`)
@Index("uq_users_username_active", ["username"], { unique: true, where: `"deleted" = false` })
export class User {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @Column({ type: "text" })
  declare username: string;

  @Column({ type: "text" })
  declare passwordHash: string;

  @Column({ type: "text" })
  declare role: UserRole;

  @Column({ type: "boolean", default: false })
  declare disabled: boolean;

  @Column({ type: "boolean", default: false })
  declare mustChangePassword: boolean;

  @Column({ type: "integer", default: 0 })
  declare failedAttempts: number;

  @Column({ type: "timestamptz", nullable: true })
  declare lockedUntil: Date | null;

  @Column({ type: "boolean", default: false })
  declare deleted: boolean;

  @Column({ type: "timestamptz", nullable: true })
  declare deletedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  declare lastLoginAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  declare createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  declare updatedAt: Date;
}
