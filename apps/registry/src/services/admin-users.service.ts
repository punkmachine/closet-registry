import type { NewUserBody, PatchUserBody } from "@closet/contract";
import type { DataSource } from "typeorm";
import { hashPassword } from "../auth/password.js";
import { revokeUserApiToken } from "../auth/repository/api-tokens.js";
import { deleteUserSessions } from "../auth/repository/sessions.js";
import {
  countActiveAdmins,
  createUser,
  findActiveUserById,
  setUserPassword,
  softDeleteUser,
  UsernameTakenError,
  updateUser,
} from "../auth/repository/users.js";
import type { AuthContext } from "../auth/types.js";
import type { User } from "../db/entities/index.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../errors/http-error.js";

export interface PatchUserResult {
  user: User;
  changes: Record<string, unknown>;
}

export interface AdminUsersService {
  create: (body: NewUserBody) => Promise<User>;
  patch: (actor: AuthContext, id: string, body: PatchUserBody) => Promise<PatchUserResult>;
  resetPassword: (id: string, password: string) => Promise<User>;
  remove: (id: string) => Promise<User>;
}

function notFound(id: string): NotFoundError {
  return new NotFoundError(`User ${id} not found`);
}

function lastAdminError(): ConflictError {
  return new ConflictError("Cannot remove the last active admin");
}

/**
 * Управление пользователями (только admin).
 *
 * @remarks Инварианты:
 * - последнего активного admin нельзя разжаловать, заблокировать или удалить; проверка идёт в транзакции с
 *   `FOR UPDATE` на строки admin, чтобы две параллельные операции не убрали двух последних разом;
 * - admin не меняет роль у самого себя;
 * - блокировка, удаление, смена роли и сброс пароля отзывают все сессии и токен пользователя в той же транзакции.
 */
export function createAdminUsersService(orm: DataSource): AdminUsersService {
  return {
    async create(body) {
      try {
        return await createUser(orm, {
          username: body.username,
          passwordHash: await hashPassword(body.password),
          role: body.role,
          mustChangePassword: true,
        });
      } catch (error) {
        if (error instanceof UsernameTakenError) {
          throw new ConflictError(error.message);
        }

        throw error;
      }
    },

    async patch(actor, id, body) {
      if (body.role !== undefined && actor.user.id === id) {
        throw new ForbiddenError("Cannot change own role");
      }

      return await orm.transaction(async (manager) => {
        const current = await findActiveUserById(manager, id);

        if (!current) {
          throw notFound(id);
        }

        const roleChanged = body.role !== undefined && body.role !== current.role;
        const disabling = body.disabled === true && !current.disabled;
        const isActiveAdmin = current.role === "admin" && !current.disabled;

        if (isActiveAdmin && (roleChanged || disabling) && (await countActiveAdmins(manager, { lock: true })) <= 1) {
          throw lastAdminError();
        }

        const changes: Record<string, unknown> = {};

        if (roleChanged) {
          changes.role = { from: current.role, to: body.role };
        }

        if (body.disabled !== undefined && body.disabled !== current.disabled) {
          changes.disabled = body.disabled;
        }

        if (body.unlock) {
          changes.unlock = true;
        }

        const user = await updateUser(manager, id, body);

        if (!user) {
          throw notFound(id);
        }

        if (roleChanged || body.disabled === true) {
          await deleteUserSessions(manager, id);
          await revokeUserApiToken(manager, id);
        }

        return { user, changes };
      });
    },

    async resetPassword(id, password) {
      const passwordHash = await hashPassword(password);

      return await orm.transaction(async (manager) => {
        const user = await findActiveUserById(manager, id);

        if (!user) {
          throw notFound(id);
        }

        await setUserPassword(manager, id, passwordHash, true);
        await deleteUserSessions(manager, id);
        await revokeUserApiToken(manager, id);

        return user;
      });
    },

    async remove(id) {
      return await orm.transaction(async (manager) => {
        const user = await findActiveUserById(manager, id);

        if (!user) {
          throw notFound(id);
        }

        if (user.role === "admin" && !user.disabled && (await countActiveAdmins(manager, { lock: true })) <= 1) {
          throw lastAdminError();
        }

        await softDeleteUser(manager, id);
        await deleteUserSessions(manager, id);
        await revokeUserApiToken(manager, id);

        return user;
      });
    },
  };
}
