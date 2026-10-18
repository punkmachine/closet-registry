import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { User } from "./user.entity.js";

/**
 *
 */
@Entity({ name: "api_tokens" })
@Index("uq_api_tokens_user_active", ["user"], { unique: true, where: `"revoked_at" IS NULL` })
export class ApiToken {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @ManyToOne("User", { nullable: false })
  declare user: User;

  @Column({ type: "text", unique: true })
  declare tokenHash: string;

  @Column({ type: "text" })
  declare prefix: string;

  @Column({ type: "timestamptz", nullable: true })
  declare lastUsedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  declare revokedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  declare createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  declare updatedAt: Date;
}
