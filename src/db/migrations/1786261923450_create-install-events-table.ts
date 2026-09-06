import type { ColumnDefinitions, MigrationBuilder } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE install_events (
      id           bigserial PRIMARY KEY,
      item_name    text NOT NULL,
      item_type    text NOT NULL,
      item_version text NOT NULL,
      installed_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  pgm.sql(`CREATE INDEX idx_install_events_item_name ON install_events (item_name);`);
  pgm.sql(`CREATE INDEX idx_install_events_installed_at ON install_events (installed_at);`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS install_events;`);
}
