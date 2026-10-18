import { passwordSchema, usernameSchema } from "@closet/contract";
import type { DataSource } from "typeorm";
import { hashPassword } from "./password.js";
import { writeAuditEntry } from "./repository/audit.js";
import { countActiveAdmins, createUser, UsernameTakenError } from "./repository/users.js";

/**
 * Первого admin создать нельзя: не заданы или невалидны `ADMIN_USERNAME` / `ADMIN_PASSWORD`, либо логин занят.
 */
export class BootstrapAdminError extends Error {
  /**
   * Создаёт ошибку с текстом, который сразу попадёт в лог старта.
   *
   * @param message - причина и что нужно исправить
   */
  constructor(message: string) {
    super(message);

    this.name = "BootstrapAdminError";
  }
}

/**
 * Создаёт первого admin из `ADMIN_USERNAME` / `ADMIN_PASSWORD`, если активных admin ещё нет.
 *
 * @remarks
 * Существующего admin не трогает: после первого запуска пароль меняется только через UI. Если admin нет,
 * а переменные не заданы или не проходят валидацию — `BootstrapAdminError` с понятным текстом (сервер без
 * единого admin бесполезен, лучше упасть на старте).
 *
 * @param dataSource - источник данных
 * @param env - переменные окружения (в тестах подменяются)
 * @returns `true`, если admin создан
 * @throws {BootstrapAdminError} если admin нет, а переменные не позволяют его создать
 */
export async function bootstrapAdmin(dataSource: DataSource, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if ((await countActiveAdmins(dataSource)) > 0) {
    return false;
  }

  const rawUsername = env.ADMIN_USERNAME;
  const rawPassword = env.ADMIN_PASSWORD;
  if (!rawUsername || !rawPassword) {
    throw new BootstrapAdminError(
      "В базе нет ни одного admin: задайте ADMIN_USERNAME и ADMIN_PASSWORD, чтобы создать первого",
    );
  }

  const username = usernameSchema.safeParse(rawUsername);
  if (!username.success) {
    throw new BootstrapAdminError(`ADMIN_USERNAME не прошёл проверку: ${username.error.issues[0]?.message ?? ""}`);
  }

  const password = passwordSchema.safeParse(rawPassword);
  if (!password.success) {
    throw new BootstrapAdminError(`ADMIN_PASSWORD не прошёл проверку: ${password.error.issues[0]?.message ?? ""}`);
  }

  try {
    const admin = await createUser(dataSource, {
      username: username.data,
      passwordHash: await hashPassword(password.data),
      role: "admin",
      mustChangePassword: false,
    });

    await writeAuditEntry(dataSource, {
      actorId: null,
      actorUsername: "system",
      action: "user.bootstrap",
      targetType: "user",
      targetId: admin.id,
      details: { username: admin.username },
    });
  } catch (error) {
    if (error instanceof UsernameTakenError) {
      throw new BootstrapAdminError(
        `Пользователь ${username.data} уже существует, но не является активным admin: выберите другой ADMIN_USERNAME`,
      );
    }

    throw error;
  }

  return true;
}
