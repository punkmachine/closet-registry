import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE items (
      id           bigserial PRIMARY KEY,
      name         text NOT NULL,
      type         text NOT NULL,
      version      text NOT NULL,
      description  text NOT NULL,
      dependencies text[] NOT NULL DEFAULT '{}',
      files        jsonb NOT NULL, -- [{ path, rootPath?, merge?, template? }], без content
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (name, version)
    );
  `);

  pgm.sql(`CREATE INDEX idx_items_name ON items (name);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS items;`);
}
