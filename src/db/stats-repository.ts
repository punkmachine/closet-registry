import type { Pool } from "pg";

export async function recordInstall(
  pool: Pool,
  itemName: string,
  itemType: string,
  itemVersion: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO install_events (item_name, item_type, item_version) VALUES ($1, $2, $3)`,
    [itemName, itemType, itemVersion],
  );
}
