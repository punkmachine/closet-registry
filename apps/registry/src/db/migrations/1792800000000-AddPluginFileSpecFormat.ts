import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Нейтральные источники (`format = 'spec'`): файл хранится один, а файлы под harness'ы генерируются при выдаче bundle.
 * Существующие строки становятся `raw` без изменений.
 */
export class AddPluginFileSpecFormat1792800000000 implements MigrationInterface {
  name = "AddPluginFileSpecFormat1792800000000";

  /**
   * Добавляет `format` и `targets` в `plugin_files`.
   */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plugin_files"
        ADD COLUMN "format" text NOT NULL DEFAULT 'raw' CHECK ("format" IN ('raw', 'spec')),
        ADD COLUMN "targets" text[],
        ADD CONSTRAINT "ck_plugin_files_spec_targets" CHECK (
          ("format" = 'raw' AND "targets" IS NULL)
          OR ("format" = 'spec' AND "ai" IS NULL AND "targets" IS NOT NULL AND cardinality("targets") > 0)
        );
    `);
  }

  /**
   * Удаляет `format` и `targets`. Spec-файлы после отката станут обычными файлами с нейтральным содержимым.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "plugin_files"
        DROP CONSTRAINT IF EXISTS "ck_plugin_files_spec_targets",
        DROP COLUMN IF EXISTS "targets",
        DROP COLUMN IF EXISTS "format";
    `);
  }
}
