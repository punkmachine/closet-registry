import type { Pool } from "pg";
import semver from "semver";
import type { ItemFile, ItemMetadata, ItemType } from "./types.js";

interface ItemRow {
  name: string;
  type: string;
  version: string;
  description: string;
  dependencies: string[];
  files: ItemFile[];
}

function mapRow(row: ItemRow): ItemMetadata {
  return {
    name: row.name,
    type: row.type as ItemType,
    version: row.version,
    description: row.description,
    dependencies: row.dependencies,
    files: row.files,
  };
}

function pickLatest<T extends { version: string }>(rows: T[]): T {
  return rows.reduce((latest, row) => (semver.gt(row.version, latest.version) ? row : latest));
}

const SELECT_COLUMNS = "name, type, version, description, dependencies, files";

export async function listLatestItems(pool: Pool): Promise<ItemMetadata[]> {
  const { rows } = await pool.query<ItemRow>(`SELECT ${SELECT_COLUMNS} FROM items ORDER BY name`);

  const byName = new Map<string, ItemRow[]>();
  for (const row of rows) {
    const bucket = byName.get(row.name);
    if (bucket) {
      bucket.push(row);
    } else {
      byName.set(row.name, [row]);
    }
  }

  return Array.from(byName.values())
    .map((versions) => mapRow(pickLatest(versions)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLatestItemByName(pool: Pool, name: string): Promise<ItemMetadata | null> {
  const { rows } = await pool.query<ItemRow>(
    `SELECT ${SELECT_COLUMNS} FROM items WHERE name = $1`,
    [name],
  );

  if (rows.length === 0) {
    return null;
  }

  return mapRow(pickLatest(rows));
}

export async function getItemVersion(
  pool: Pool,
  name: string,
  version: string,
): Promise<ItemMetadata | null> {
  const { rows } = await pool.query<ItemRow>(
    `SELECT ${SELECT_COLUMNS} FROM items WHERE name = $1 AND version = $2`,
    [name, version],
  );

  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findMissingDependencies(pool: Pool, dependencyNames: string[]): Promise<string[]> {
  if (dependencyNames.length === 0) {
    return [];
  }

  const { rows } = await pool.query<{ name: string }>(
    `SELECT DISTINCT name FROM items WHERE name = ANY($1::text[])`,
    [dependencyNames],
  );

  const existing = new Set(rows.map((row) => row.name));
  return dependencyNames.filter((name) => !existing.has(name));
}

export interface ItemWriteInput {
  name: string;
  type: ItemType;
  version: string;
  description: string;
  dependencies: string[];
  files: ItemFile[];
}

export async function createItem(pool: Pool, input: ItemWriteInput): Promise<ItemMetadata> {
  const { rows } = await pool.query<ItemRow>(
    `INSERT INTO items (name, type, version, description, dependencies, files)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SELECT_COLUMNS}`,
    [input.name, input.type, input.version, input.description, input.dependencies, JSON.stringify(input.files)],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("createItem: INSERT ... RETURNING вернул пустой результат");
  }
  return mapRow(row);
}

export async function upsertItemVersion(pool: Pool, input: ItemWriteInput): Promise<ItemMetadata> {
  const { rows } = await pool.query<ItemRow>(
    `INSERT INTO items (name, type, version, description, dependencies, files)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (name, version) DO UPDATE SET
       type = EXCLUDED.type,
       description = EXCLUDED.description,
       dependencies = EXCLUDED.dependencies,
       files = EXCLUDED.files,
       updated_at = now()
     RETURNING ${SELECT_COLUMNS}`,
    [input.name, input.type, input.version, input.description, input.dependencies, JSON.stringify(input.files)],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("upsertItemVersion: INSERT ... RETURNING вернул пустой результат");
  }
  return mapRow(row);
}

export async function deleteItemVersion(
  pool: Pool,
  name: string,
  version: string,
): Promise<ItemMetadata | null> {
  const { rows } = await pool.query<ItemRow>(
    `DELETE FROM items WHERE name = $1 AND version = $2 RETURNING ${SELECT_COLUMNS}`,
    [name, version],
  );

  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteAllVersions(pool: Pool, name: string): Promise<ItemMetadata[]> {
  const { rows } = await pool.query<ItemRow>(
    `DELETE FROM items WHERE name = $1 RETURNING ${SELECT_COLUMNS}`,
    [name],
  );

  return rows.map(mapRow);
}
