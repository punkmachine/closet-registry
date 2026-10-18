import type { User as UserDto } from "@closet/contract";
import type { ApiToken, User } from "../db/entities/index.js";

/**
 * Пользователь в формате API (без хеша пароля и счётчиков).
 *
 * @param user - entity пользователя
 * @returns DTO по `userSchema`
 */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    disabled: user.disabled,
    mustChangePassword: user.mustChangePassword,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * Метаданные API-токена в формате API.
 *
 * @param token - entity токена
 * @returns DTO по `apiTokenSchema`
 */
export function toApiTokenDto(token: ApiToken): { prefix: string; createdAt: string; lastUsedAt: string | null } {
  return {
    prefix: token.prefix,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
  };
}
