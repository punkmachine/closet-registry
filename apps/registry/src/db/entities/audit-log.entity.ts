import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/** Append-only: записи не обновляются и не удаляются, поэтому `updated_at` нет. */
@Entity({ name: "audit_log" })
export class AuditLog {
  @PrimaryGeneratedColumn({ type: "bigint" })
  declare id: string;

  @Column({ type: "bigint", nullable: true })
  declare actorId: string | null;

  @Column({ type: "text" })
  declare actorUsername: string;

  @Column({ type: "text" })
  declare action: string;

  @Column({ type: "text", nullable: true })
  declare targetType: string | null;

  @Column({ type: "text", nullable: true })
  declare targetId: string | null;

  @Column({ type: "jsonb", nullable: true })
  declare details: Record<string, unknown> | null;

  @Column({ type: "text", nullable: true })
  declare ip: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  @Index()
  declare createdAt: Date;
}
