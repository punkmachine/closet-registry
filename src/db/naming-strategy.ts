import { DefaultNamingStrategy, type NamingStrategyInterface } from "typeorm";

function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Схема описана в snake_case (plugin_id, deleted_at, size_bytes, ...),
 * а entities по конвенции TypeScript пишутся в camelCase — эта стратегия конвертирует
 * автоматически, без `name` на каждой колонке.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return customName ?? toSnakeCase([...embeddedPrefixes, propertyName].join("_"));
  }

  override relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  override joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return toSnakeCase(columnName ? `${tableName}_${columnName}` : `${tableName}_${propertyName}`);
  }
}
