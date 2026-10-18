import type { AssignableRole, UserRole } from "@closet/contract";
import type { DataSource, EntityManager } from "typeorm";
import { QueryFailedError } from "typeorm";
import { User } from "../../db/entities/index.js";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Имя пользователя уже занято среди не удалённых.
 */
export class UsernameTakenError extends Error {
  /**
   * Запоминает занятое имя.
   *
   * @param username - занятое имя
   */
  constructor(public readonly username: string) {
    super(`User ${username} already exists`);

    this.name = "UsernameTakenError";
  }
}

export interface NewUserInput {
  username: string;
  passwordHash: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface UserPatch {
  role?: AssignableRole;
  disabled?: boolean;
  unlock?: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Ищет не удалённого пользователя по логину.
 *
 * @param dataSource - источник данных
 * @param username - логин
 * @returns пользователь или `null`
 */
export async function findActiveUserByUsername(dataSource: DataSource, username: string): Promise<User | null> {
  return await dataSource.getRepository(User).findOne({ where: { username, deleted: false } });
}

/**
 * Ищет не удалённого пользователя по id.
 *
 * @param manager - источник данных или менеджер транзакции
 * @param id - id пользователя
 * @returns пользователь или `null`
 */
export async function findActiveUserById(manager: DataSource | EntityManager, id: string): Promise<User | null> {
  return await manager.getRepository(User).findOne({ where: { id, deleted: false } });
}

/**
 * Список не удалённых пользователей по возрастанию id.
 *
 * @param dataSource - источник данных
 * @returns пользователи
 */
export async function listActiveUsers(dataSource: DataSource): Promise<User[]> {
  return await dataSource.getRepository(User).find({ where: { deleted: false }, order: { id: "ASC" } });
}

/**
 * Число активных (не удалённых и не заблокированных админом) admin. Нужно для защиты последнего admin.
 *
 * @param manager - источник данных или менеджер транзакции
 * @param options - `lock`: взять `FOR UPDATE` на строки admin (только внутри транзакции), чтобы две параллельные
 * операции не убрали последних двух admin одновременно
 * @returns количество активных admin
 */
export async function countActiveAdmins(
  manager: DataSource | EntityManager,
  options: { lock?: boolean } = {},
): Promise<number> {
  const repo = manager.getRepository(User);
  const where = { role: "admin", deleted: false, disabled: false } as const;

  if (!options.lock) {
    return await repo.count({ where });
  }

  const locked = await repo.find({ where, select: { id: true }, lock: { mode: "pessimistic_write" } });

  return locked.length;
}

/**
 * Создаёт пользователя. Занятый `username` среди не удалённых — `UsernameTakenError` (гонку закрывает
 * частичный уникальный индекс, а не предварительная проверка).
 *
 * @param dataSource - источник данных
 * @param input - данные нового пользователя
 * @returns созданный пользователь
 * @throws {UsernameTakenError} если логин занят
 */
export async function createUser(dataSource: DataSource, input: NewUserInput): Promise<User> {
  const repo = dataSource.getRepository(User);

  try {
    return await repo.save(repo.create(input));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new UsernameTakenError(input.username);
    }

    throw error;
  }
}

/**
 * Применяет изменения роли/блокировки. Отзыв сессий и токенов при смене роли или блокировке — на вызывающем
 * (`revokeAllCredentials`).
 *
 * @param manager - источник данных или менеджер транзакции
 * @param id - id пользователя
 * @param patch - изменения
 * @returns обновлённый пользователь или `null`, если его нет или он удалён
 */
export async function updateUser(
  manager: DataSource | EntityManager,
  id: string,
  patch: UserPatch,
): Promise<User | null> {
  const repo = manager.getRepository(User);
  const user = await repo.findOne({ where: { id, deleted: false } });

  if (!user) {
    return null;
  }

  if (patch.role !== undefined) {
    user.role = patch.role;
  }

  if (patch.disabled !== undefined) {
    user.disabled = patch.disabled;
  }

  if (patch.unlock) {
    user.failedAttempts = 0;
    user.lockedUntil = null;
  }

  return await repo.save(user);
}

/**
 * Задаёт новый хеш пароля и снимает блокировку входа.
 *
 * @param manager - источник данных или менеджер транзакции
 * @param id - id пользователя
 * @param passwordHash - хеш из `hashPassword`
 * @param mustChangePassword - `true` для сброса админом (юзер обязан сменить пароль при входе)
 */
export async function setUserPassword(
  manager: DataSource | EntityManager,
  id: string,
  passwordHash: string,
  mustChangePassword: boolean,
): Promise<void> {
  await manager
    .getRepository(User)
    .update({ id }, { passwordHash, mustChangePassword, failedAttempts: 0, lockedUntil: null });
}

/**
 * Мягко удаляет пользователя. `username` освобождается (индекс уникальности только среди `deleted = false`),
 * ссылки `created_by_id` / `updated_by_id` остаются валидными.
 *
 * @param manager - источник данных или менеджер транзакции
 * @param id - id пользователя
 * @param now - момент удаления
 * @returns `true`, если пользователь был и удалён
 */
export async function softDeleteUser(
  manager: DataSource | EntityManager,
  id: string,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await manager.getRepository(User).update({ id, deleted: false }, { deleted: true, deletedAt: now });

  return (result.affected ?? 0) > 0;
}

/**
 * Учитывает неудачный вход: после `MAX_FAILED_LOGIN_ATTEMPTS` подряд блокирует аккаунт на `LOCK_DURATION_MS`
 * и обнуляет счётчик. Строка лочится `FOR UPDATE`, чтобы параллельные попытки не потерялись.
 *
 * @param dataSource - источник данных
 * @param id - id пользователя
 * @param now - момент попытки
 * @returns обновлённый пользователь или `null`, если его нет или он удалён
 */
export async function registerFailedLogin(
  dataSource: DataSource,
  id: string,
  now: Date = new Date(),
): Promise<User | null> {
  return await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(User);
    const user = await repo.findOne({ where: { id, deleted: false }, lock: { mode: "pessimistic_write" } });

    if (!user) {
      return null;
    }

    user.failedAttempts += 1;

    if (user.failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      user.failedAttempts = 0;
      user.lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
    }

    return await repo.save(user);
  });
}

/**
 * Учитывает успешный вход: сбрасывает счётчик неудач и блокировку, проставляет `last_login_at`.
 *
 * @param dataSource - источник данных
 * @param id - id пользователя
 * @param now - момент входа
 */
export async function registerSuccessfulLogin(
  dataSource: DataSource,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  await dataSource.getRepository(User).update({ id }, { failedAttempts: 0, lockedUntil: null, lastLoginAt: now });
}
