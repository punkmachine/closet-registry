import { DefaultNamingStrategy, type NamingStrategyInterface } from "typeorm";

function toSnakeCase(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Схема описана в snake_case (plugin_id, deleted_at, size_bytes, ...),
 * а entities по конвенции TypeScript пишутся в camelCase — эта стратегия конвертирует
 * автоматически, без `name` на каждой колонке.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  /**
   * Возвращает имя колонки в snake_case.
   */
  override columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return customName ?? toSnakeCase([...embeddedPrefixes, propertyName].join("_"));
  }

  /**
   * Возвращает имя колонки связи в snake_case.
   */
  override relationName(propertyName: string): string {
    return toSnakeCase(propertyName);
  }

  /**
   * Возвращает имя join-колонки в snake_case.
   */
  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return toSnakeCase(`${relationName}_${referencedColumnName}`);
  }

  /**
   * Возвращает имя колонки join-таблицы в snake_case.
   */
  override joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return toSnakeCase(columnName ? `${tableName}_${columnName}` : `${tableName}_${propertyName}`);
  }
}
