import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import type { User } from "./user.entity.js";

/**
 *
 */
@Entity({ name: "sessions" })
export class Session {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @ManyToOne("User", { nullable: false })
  @Index()
  declare user: User;

  @Column({ type: "text", unique: true })
  declare tokenHash: string;

  @Column({ type: "timestamptz" })
  declare expiresAt: Date;

  @Column({ type: "timestamptz" })
  declare lastUsedAt: Date;

  @Column({ type: "text", nullable: true })
  declare userAgent: string | null;

  @Column({ type: "text", nullable: true })
  declare ip: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  declare createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  declare updatedAt: Date;
}
