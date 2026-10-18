import {
  type PermissionAction,
  type PermissionResource,
  ROLE_PERMISSIONS,
  type User,
  type UserRole,
} from "@closet/contract";

export interface PagePermission {
  resource: PermissionResource;
  action: PermissionAction;
}

/** Есть ли у роли право на действие над объектом; без роли (не вошёл) — всегда нет. */
export function roleCan(role: UserRole | undefined, resource: PermissionResource, action: PermissionAction): boolean {
  return role ? ROLE_PERMISSIONS[role][resource].includes(action) : false;
}

interface GuardInput {
  user: Pick<User, "role" | "mustChangePassword"> | null;
  path: string;
  isPublic: boolean;
  permission?: PagePermission | undefined;
}

/** Временная блокировка ещё действует (`lockedUntil` в будущем). */
export function isUserLocked(user: Pick<User, "lockedUntil">, now: number = Date.now()): boolean {
  return user.lockedUntil !== null && new Date(user.lockedUntil).getTime() > now;
}

/**
 * Решение глобального route middleware: куда перенаправить или `null`, если страница доступна.
 * Чистая функция, чтобы покрывать юнит-тестом без Nuxt. UI-проверка — удобство, настоящую защиту делает реестр (403).
 */
export function resolveAuthRedirect({ user, path, isPublic, permission }: GuardInput): string | null {
  if (!user) {
    return isPublic ? null : "/login";
  }

  if (path === "/login") {
    return "/";
  }

  if (user.mustChangePassword) {
    return path === "/account" ? null : "/account";
  }

  return permission && !roleCan(user.role, permission.resource, permission.action) ? "/" : null;
}
