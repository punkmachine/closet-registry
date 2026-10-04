import semver from "semver";
import { z } from "zod";

/**
 * Slug плагина. Набор символов ограничен сознательно: slug становится именем
 * директории на диске реестра, и всё, что не попадает в шаблон, открывает
 * path traversal (в частности буква диска на Windows-хосте разрешается в корень диска).
 */
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "slug: только [a-z0-9._-], первый символ — буква или цифра")
  .refine((value) => !value.includes(".."), "slug не может содержать '..'");

/** Версия плагина. Тот же semver, что и при публикации — в том числе в URL-параметрах PUT/DELETE. */
export const semverSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => semver.valid(value) !== null, "must be a valid semver string");

/** Литерал `latest` допустим только при чтении bundle. */
export const versionOrLatestSchema = z.union([semverSchema, z.literal("latest")]);
