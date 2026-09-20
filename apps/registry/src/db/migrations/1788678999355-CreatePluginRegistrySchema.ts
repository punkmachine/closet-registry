import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePluginRegistrySchema1788678999355 implements MigrationInterface {
  name = "CreatePluginRegistrySchema1788678999355";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "plugins" (
        "id"          bigserial PRIMARY KEY,
        "slug"        text NOT NULL UNIQUE,
        "description" text NOT NULL,
        "deleted"     boolean NOT NULL DEFAULT false,
        "deleted_at"  timestamptz,
        "created_at"  timestamptz NOT NULL DEFAULT now(),
        "updated_at"  timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "plugin_versions" (
        "id"         bigserial PRIMARY KEY,
        "plugin_id"  bigint NOT NULL REFERENCES "plugins" ("id"),
        "version"    text NOT NULL,
        "changelog"  text,
        "deleted"    boolean NOT NULL DEFAULT false,
        "deleted_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("plugin_id", "version")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_plugin_versions_plugin_id" ON "plugin_versions" ("plugin_id");`);

    await queryRunner.query(`
      CREATE TABLE "plugin_files" (
        "id"              bigserial PRIMARY KEY,
        "version_id"      bigint NOT NULL REFERENCES "plugin_versions" ("id"),
        "component"       text NOT NULL CHECK ("component" IN ('mcp', 'rules', 'hooks', 'agents', 'commands', 'skills', 'scripts')),
        "ai"              text CHECK ("ai" IS NULL OR "ai" IN ('codex', 'claude-code')),
        "relative_path"   text NOT NULL,
        "storage_path"    text NOT NULL,
        "sha256"          text NOT NULL,
        "size_bytes"      bigint NOT NULL,
        "root_path"       boolean NOT NULL DEFAULT false,
        "merge"           boolean NOT NULL DEFAULT false,
        "merge_key_path"  text,
        "template"        boolean NOT NULL DEFAULT false,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("version_id", "component", "ai", "relative_path")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_plugin_files_version_id" ON "plugin_files" ("version_id");`);

    await queryRunner.query(`
      CREATE TABLE "plugin_dependencies" (
        "plugin_id"            bigint NOT NULL REFERENCES "plugins" ("id"),
        "depends_on_plugin_id" bigint NOT NULL REFERENCES "plugins" ("id"),
        PRIMARY KEY ("plugin_id", "depends_on_plugin_id")
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_plugin_dependencies_depends_on_plugin_id" ON "plugin_dependencies" ("depends_on_plugin_id");`);

    await queryRunner.query(`
      CREATE TABLE "install_events" (
        "id"                 bigserial PRIMARY KEY,
        "plugin_id"          bigint NOT NULL REFERENCES "plugins" ("id"),
        "plugin_version_id"  bigint NOT NULL REFERENCES "plugin_versions" ("id"),
        "cli_version"        text NOT NULL,
        "installed_at"       timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX "idx_install_events_plugin_id" ON "install_events" ("plugin_id");`);
    await queryRunner.query(`CREATE INDEX "idx_install_events_plugin_version_id" ON "install_events" ("plugin_version_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "install_events";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plugin_dependencies";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plugin_files";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plugin_versions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "plugins";`);
  }
}
