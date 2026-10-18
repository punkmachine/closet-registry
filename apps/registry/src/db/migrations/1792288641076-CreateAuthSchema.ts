import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * NOT NULL `created_by_id`/`updated_by_id` на `plugins`/`plugin_versions` не мигрируют старые строки:
 * на непустых таблицах `up()` упадёт, базу нужно пересоздать с нуля (так решено в плане авторизации).
 */
export class CreateAuthSchema1792288641076 implements MigrationInterface {
  name = "CreateAuthSchema1792288641076";

  /**
   *
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                   bigserial PRIMARY KEY,
        "username"             text NOT NULL,
        "password_hash"        text NOT NULL,
        "role"                 text NOT NULL CHECK ("role" IN ('admin', 'developer', 'guest')),
        "disabled"             boolean NOT NULL DEFAULT false,
        "must_change_password" boolean NOT NULL DEFAULT false,
        "failed_attempts"      integer NOT NULL DEFAULT 0,
        "locked_until"         timestamptz,
        "deleted"              boolean NOT NULL DEFAULT false,
        "deleted_at"           timestamptz,
        "last_login_at"        timestamptz,
        "created_at"           timestamptz NOT NULL DEFAULT now(),
        "updated_at"           timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_users_username_active" ON "users" ("username") WHERE "deleted" = false;`,
    );

    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id"           bigserial PRIMARY KEY,
        "user_id"      bigint NOT NULL REFERENCES "users" ("id"),
        "token_hash"   text NOT NULL UNIQUE,
        "expires_at"   timestamptz NOT NULL,
        "last_used_at" timestamptz NOT NULL DEFAULT now(),
        "user_agent"   text,
        "ip"           text,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id");`);

    await queryRunner.query(`
      CREATE TABLE "api_tokens" (
        "id"           bigserial PRIMARY KEY,
        "user_id"      bigint NOT NULL REFERENCES "users" ("id"),
        "token_hash"   text NOT NULL UNIQUE,
        "prefix"       text NOT NULL,
        "last_used_at" timestamptz,
        "revoked_at"   timestamptz,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "updated_at"   timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_api_tokens_user_active" ON "api_tokens" ("user_id") WHERE "revoked_at" IS NULL;`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id"             bigserial PRIMARY KEY,
        "actor_id"       bigint,
        "actor_username" text NOT NULL,
        "action"         text NOT NULL,
        "target_type"    text,
        "target_id"      text,
        "details"        jsonb,
        "ip"             text,
        "created_at"     timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_audit_log_created_at" ON "audit_log" ("created_at");`);

    await queryRunner.query(`
      ALTER TABLE "plugins"
        ADD COLUMN "created_by_id" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
        ADD COLUMN "updated_by_id" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE "plugin_versions"
        ADD COLUMN "created_by_id" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
        ADD COLUMN "updated_by_id" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT;
    `);
  }

  /**
   *
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "plugin_versions" DROP COLUMN IF EXISTS "updated_by_id", DROP COLUMN IF EXISTS "created_by_id";`,
    );
    await queryRunner.query(
      `ALTER TABLE "plugins" DROP COLUMN IF EXISTS "updated_by_id", DROP COLUMN IF EXISTS "created_by_id";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "api_tokens";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sessions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
  }
}
