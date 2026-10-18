import type { PermissionAction, PermissionResource, UserRole } from "@closet/contract";
import { ROLE_PERMISSIONS } from "@closet/contract";
import type { FastifyRequest } from "fastify";
import { ForbiddenError, UnauthorizedError } from "../errors/http-error.js";
import type { AuthContext } from "./types.js";

export const PASSWORD_CHANGE_REQUIRED_CODE = "password_change_required";

/**
 * Есть ли у роли право на действие над объектом (по `ROLE_PERMISSIONS` из контракта).
 *
 * @param role - роль пользователя
 * @param resource - объект
 * @param action - действие
 * @returns `true`, если действие разрешено
 */
export function hasPermission(role: UserRole, resource: PermissionResource, action: PermissionAction): boolean {
  return ROLE_PERMISSIONS[role][resource].includes(action);
}

/**
 * Контекст авторизации запроса. На защищённых роутах его кладёт auth-хук; `null` означает, что хук не отработал
 * (публичный роут) — защищённому коду это ошибка, поэтому отвечаем `401`.
 *
 * @param request - запрос
 * @returns контекст авторизации
 * @throws {UnauthorizedError} если запрос не аутентифицирован
 */
export function getAuth(request: Pick<FastifyRequest, "auth">): AuthContext {
  if (!request.auth) {
    throw new UnauthorizedError();
  }

  return request.auth;
}

/**
 * Блок `must_change_password`: до смены пароля доступны только роуты с `config.allowPasswordChange`.
 *
 * @param request - аутентифицированный запрос
 * @throws {ForbiddenError} если пароль нужно сменить, а роут это не разрешает
 */
export function enforcePasswordChange(request: FastifyRequest): void {
  if (getAuth(request).user.mustChangePassword && request.routeOptions.config.allowPasswordChange !== true) {
    throw new ForbiddenError("Password change required", PASSWORD_CHANGE_REQUIRED_CODE);
  }
}

/**
 * Фабрика `onRequest`-хука роута: пускает, только если роль имеет право. Стоит в `onRequest`, а не в
 * `preHandler`, чтобы `403` не зависел от валидации тела и разбора multipart.
 *
 * @param resource - объект
 * @param action - действие
 * @returns хук для `onRequest` роута. Параметр сужен до `auth`: полный `FastifyRequest` сбивает вывод типов
 * `RouteGeneric` у хендлеров с `params`
 */
export function requirePermission(
  resource: PermissionResource,
  action: PermissionAction,
): (request: Pick<FastifyRequest, "auth">) => Promise<void> {
  // eslint-disable-next-line @typescript-eslint/require-await -- Fastify ждёт promise-хук без done-колбэка
  return async (request) => {
    if (!hasPermission(getAuth(request).user.role, resource, action)) {
      throw new ForbiddenError("Forbidden");
    }
  };
}
