import { z } from "zod";

export const USER_ROLES = ["admin", "developer", "guest"] as const;
export const ASSIGNABLE_ROLES = ["developer", "guest"] as const;

/**
 * Роль пользователя. Права роли — в `ROLE_PERMISSIONS`.
 */
export const userRoleSchema = z.enum(USER_ROLES);

/**
 * Роль, которую admin может назначить через API: `admin` создаётся только bootstrap'ом.
 */
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES);

export const PERMISSION_ACTIONS = ["read", "write", "update", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_RESOURCES = ["plugins", "users"] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

/**
 * Единый источник прав ролей по объектам: бэкенд (`requirePermission`) и админка (`can()`) читают его же.
 * Пустой массив — доступа к объекту нет.
 */
export const ROLE_PERMISSIONS: Readonly<
  Record<UserRole, Readonly<Record<PermissionResource, readonly PermissionAction[]>>>
> = {
  admin: { plugins: ["read", "write", "delete"], users: ["read", "write", "update", "delete"] },
  developer: { plugins: ["read", "write"], users: [] },
  guest: { plugins: ["read"], users: [] },
};

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[a-z0-9._-]+$/, "username: только [a-z0-9._-]");

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Допустимые спецсимволы пароля. Из этого же набора генератор на фронте берёт спецсимвол,
 * поэтому валидация и генерация не расходятся.
 */
export const PASSWORD_SPECIAL_CHARS = "!@#$%^&*()-_=+[]{};:,.?/~";

const PASSWORD_SPECIAL_CHAR_REGEXP = new RegExp(`[${PASSWORD_SPECIAL_CHARS.replaceAll(/[\\\]^-]/g, String.raw`\$&`)}]`);

/**
 * Проверяет, что в пароле есть хотя бы один спецсимвол из `PASSWORD_SPECIAL_CHARS`.
 * @param password - проверяемый пароль
 * @returns `true`, если спецсимвол найден
 */
export function hasPasswordSpecialChar(password: string): boolean {
  return PASSWORD_SPECIAL_CHAR_REGEXP.test(password);
}

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Пароль: минимум ${String(PASSWORD_MIN_LENGTH)} символов`)
  .max(PASSWORD_MAX_LENGTH)
  .refine(hasPasswordSpecialChar, `Пароль: нужен минимум один спецсимвол (${PASSWORD_SPECIAL_CHARS})`);

/**
 * Идентификаторы в API — строки (`bigint` в БД, см. entity).
 */
const idSchema = z.string().min(1);

/**
 * Краткая ссылка на автора. Удалённый пользователь остаётся в БД (soft delete), поэтому ссылка всегда есть.
 */
export const authorRefSchema = z.object({ username: z.string() });

export const loginBodySchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const userSchema = z.object({
  id: idSchema,
  username: z.string(),
  role: userRoleSchema,
  disabled: z.boolean(),
  mustChangePassword: z.boolean(),
  lockedUntil: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const loginResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  user: userSchema,
});

export const meResponseSchema = z.object({
  user: userSchema,
});

export const userListResponseSchema = z.object({
  users: z.array(userSchema),
});

export const newUserBodySchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: assignableRoleSchema,
});

export const patchUserBodySchema = z
  .object({
    role: assignableRoleSchema.optional(),
    disabled: z.boolean().optional(),
    unlock: z.literal(true).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, "Нужно указать хотя бы одно поле");

export const resetPasswordBodySchema = z.object({
  password: passwordSchema,
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});

export const userIdParamsSchema = z.object({
  id: idSchema,
});

/**
 * Метаданные персонального API-токена (`clt_…`). Полное значение сервер не хранит.
 */
export const apiTokenSchema = z.object({
  prefix: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const apiTokenResponseSchema = z.object({
  token: apiTokenSchema.nullable(),
});

/**
 * Ответ выпуска/перевыпуска: `value` с полным токеном возвращается один раз.
 */
export const apiTokenIssuedSchema = apiTokenSchema.extend({
  value: z.string(),
});

export const auditEntrySchema = z.object({
  id: idSchema,
  actorId: idSchema.nullable(),
  actorUsername: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
});

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: idSchema.optional(),
});

export const auditListResponseSchema = z.object({
  entries: z.array(auditEntrySchema),
});

export type UserRole = z.infer<typeof userRoleSchema>;
export type AssignableRole = z.infer<typeof assignableRoleSchema>;
export type AuthorRef = z.infer<typeof authorRefSchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type User = z.infer<typeof userSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type UserListResponse = z.infer<typeof userListResponseSchema>;
export type NewUserBody = z.infer<typeof newUserBodySchema>;
export type PatchUserBody = z.infer<typeof patchUserBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type ApiToken = z.infer<typeof apiTokenSchema>;
export type ApiTokenResponse = z.infer<typeof apiTokenResponseSchema>;
export type ApiTokenIssued = z.infer<typeof apiTokenIssuedSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
