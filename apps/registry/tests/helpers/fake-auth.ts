/**
 * In-memory fake репозиториев авторизации (users / sessions / api-tokens / audit) для API-тестов.
 *
 * Воспроизводит семантику `src/auth/repository/*`: активные = не удалённые, отзыв сессий и токенов,
 * один активный API-токен на пользователя, счётчик неудачных входов с блокировкой, мягкое удаление.
 * Сигнатуры и возвращаемые формы те же, что у реальных функций (первый аргумент `DataSource`/`EntityManager`
 * игнорируется). Хранилище — синглтон `fakeAuth`; пользователей, сессии и токены в тест кладут `seed*`.
 *
 * Подмена модулей делается в `tests/setup/mock-db.ts`, фабрики модулей — `create*RepositoryModule`.
 *
 * Отличия от Postgres: нет транзакций (`orm.transaction` в заглушке просто вызывает колбэк), поэтому при
 * ошибке посреди операции откат не происходит; сортировка и уникальность — на уровне Map/массивов.
 */
import type { UserRole } from "@closet/contract";
import { hashPassword } from "../../src/auth/password.js";
import type { AuditEntryInput, AuditListOptions } from "../../src/auth/repository/audit.js";
import type { NewSessionInput } from "../../src/auth/repository/sessions.js";
import type { NewUserInput, UserPatch } from "../../src/auth/repository/users.js";
import { generateApiToken, generateSessionToken, tokenDisplayPrefix } from "../../src/auth/tokens.js";
import type { ApiToken } from "../../src/db/entities/api-token.entity.js";
import type { AuditLog } from "../../src/db/entities/audit-log.entity.js";
import type { Session } from "../../src/db/entities/session.entity.js";
import type { User } from "../../src/db/entities/user.entity.js";

/** Пароль, который проходит `passwordSchema` и которым хэшируются пользователи из `seedUser`. */
export const DEFAULT_TEST_PASSWORD = "Test-pass-123!";

export interface SeedUserOptions {
  username?: string;
  mustChangePassword?: boolean;
  disabled?: boolean;
  deleted?: boolean;
  failedAttempts?: number;
  lockedUntil?: Date | null;
}

export interface SeededCredential {
  user: User;
  token: string;
  authHeader: { authorization: string };
}

/** Константы и ошибка из настоящего `users.ts`/`sessions.ts` (передаются из `importOriginal`). */
export interface UsersRepositoryOriginal {
  MAX_FAILED_LOGIN_ATTEMPTS: number;
  LOCK_DURATION_MS: number;
  UsernameTakenError: new (username: string) => Error;
}

export interface SessionsRepositoryOriginal {
  SESSION_TTL_MS: number;
}

export class FakeAuth {
  private users: User[] = [];
  private sessions = new Map<string, Session>();
  private apiTokens = new Map<string, ApiToken>();
  private idCounter = 0;
  private lastUser: User | null = null;
  private auditEntries: (AuditEntryInput & { id: string; createdAt: Date })[] = [];

  private nextId(): string {
    this.idCounter += 1;
    return String(this.idCounter);
  }

  private createUser(role: UserRole, options: SeedUserOptions, passwordHash = "x"): User {
    const id = this.nextId();
    const user: User = {
      id,
      username: options.username ?? `${role}-${id}`,
      passwordHash,
      role,
      disabled: options.disabled ?? false,
      mustChangePassword: options.mustChangePassword ?? false,
      failedAttempts: options.failedAttempts ?? 0,
      lockedUntil: options.lockedUntil ?? null,
      deleted: options.deleted ?? false,
      deletedAt: options.deleted ? new Date() : null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.users.push(user);
    this.lastUser = user;

    return user;
  }

  private addApiToken(user: User): { token: ApiToken; value: string } {
    const generated = generateApiToken();
    const token: ApiToken = {
      id: this.nextId(),
      user,
      tokenHash: generated.hash,
      prefix: tokenDisplayPrefix(generated.value),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.apiTokens.set(generated.hash, token);

    return { token, value: generated.value };
  }

  // ---------------------------------------------------------------- управление состоянием

  reset(): void {
    this.users = [];
    this.sessions.clear();
    this.apiTokens.clear();
    this.auditEntries = [];
    this.lastUser = null;
    this.idCounter = 0;
  }

  // ---------------------------------------------------------------- посев данных

  /** Пользователь + активный API-токен. `passwordHash` фиктивный: для входа по паролю есть `seedUser`. */
  seedApiUser(role: UserRole, options: SeedUserOptions = {}): SeededCredential {
    const user = this.createUser(role, options);
    const { value } = this.addApiToken(user);

    return { user, token: value, authHeader: { authorization: `Bearer ${value}` } };
  }

  /** Пользователь + активная сессия `cls_…`. */
  seedSessionUser(role: UserRole, options: SeedUserOptions & { expiresAt?: Date } = {}): SeededCredential {
    const user = this.createUser(role, options);
    const generated = generateSessionToken();

    this.sessions.set(generated.hash, {
      id: this.nextId(),
      user,
      tokenHash: generated.hash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      lastUsedAt: new Date(),
      userAgent: null,
      ip: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { user, token: generated.value, authHeader: { authorization: `Bearer ${generated.value}` } };
  }

  /** Пользователь с настоящим scrypt-хешем пароля, без сессий и токенов — для сценариев входа. */
  async seedUser(
    role: UserRole,
    options: SeedUserOptions & { password?: string } = {},
  ): Promise<User & { password: string }> {
    const password = options.password ?? DEFAULT_TEST_PASSWORD;
    const user = this.createUser(role, options, await hashPassword(password));

    return Object.assign(user, { password });
  }

  /** Добавляет пользователю ещё одну сессию (например, «второе устройство»). */
  seedSessionFor(user: User, options: { expiresAt?: Date } = {}): SeededCredential {
    const generated = generateSessionToken();

    this.sessions.set(generated.hash, {
      id: this.nextId(),
      user,
      tokenHash: generated.hash,
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      lastUsedAt: new Date(),
      userAgent: null,
      ip: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { user, token: generated.value, authHeader: { authorization: `Bearer ${generated.value}` } };
  }

  /** Добавляет пользователю активный API-токен (отзывая прежний, как `issueApiToken`). */
  seedApiTokenFor(user: User): SeededCredential {
    this.revokeUserApiToken(user.id);
    const { value } = this.addApiToken(user);

    return { user, token: value, authHeader: { authorization: `Bearer ${value}` } };
  }

  revokeApiTokens(): void {
    for (const token of this.apiTokens.values()) {
      token.revokedAt = new Date();
    }
  }

  // ---------------------------------------------------------------- инспекция для тестов

  /** Пользователь, созданный последним вызовом `seed*`. */
  lastSeededUser(): User {
    if (!this.lastUser) {
      throw new Error("No user seeded");
    }

    return this.lastUser;
  }

  /** Пользователь по id, включая удалённых (в отличие от репозитория). */
  getUser(id: string): User {
    const user = this.users.find((u) => u.id === id);

    if (!user) {
      throw new Error(`No user with id ${id}`);
    }

    return user;
  }

  getUserByUsername(username: string): User | undefined {
    return this.users.find((u) => u.username === username && !u.deleted);
  }

  getSessions(userId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.user.id === userId);
  }

  /** Все токены пользователя, включая отозванные, в порядке выпуска. */
  getApiTokens(userId: string): ApiToken[] {
    return [...this.apiTokens.values()].filter((t) => t.user.id === userId);
  }

  getAuditEntries(): AuditEntryInput[] {
    return this.auditEntries.map((entry) => ({ ...entry }));
  }

  // ---------------------------------------------------------------- операции репозиториев

  recordAuditEntry(entry: AuditEntryInput): void {
    this.auditEntries.push({ ...entry, id: this.nextId(), createdAt: new Date() });
  }

  listAuditEntries(options: AuditListOptions): AuditLog[] {
    const before = options.before === undefined ? Infinity : Number(options.before);

    return this.auditEntries
      .filter((entry) => Number(entry.id) < before)
      .toSorted((a, b) => Number(b.id) - Number(a.id))
      .slice(0, options.limit)
      .map((entry) => ({
        id: entry.id,
        actorId: entry.actorId,
        actorUsername: entry.actorUsername,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        details: entry.details ?? null,
        ip: entry.ip ?? null,
        createdAt: entry.createdAt,
      }));
  }

  findSession(tokenHash: string): Session | null {
    return this.sessions.get(tokenHash) ?? null;
  }

  createSession(input: NewSessionInput, now: Date, ttlMs: number): Session {
    const generatedHash = input.tokenHash;
    const session: Session = {
      id: this.nextId(),
      user: this.getUser(input.userId),
      tokenHash: generatedHash,
      expiresAt: new Date(now.getTime() + ttlMs),
      lastUsedAt: now,
      userAgent: input.userAgent,
      ip: input.ip,
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(generatedHash, session);

    return session;
  }

  deleteSession(id: string): void {
    for (const [hash, session] of this.sessions) {
      if (session.id === id) this.sessions.delete(hash);
    }
  }

  deleteUserSessions(userId: string, exceptSessionId?: string): void {
    for (const [hash, session] of this.sessions) {
      if (session.user.id === userId && session.id !== exceptSessionId) this.sessions.delete(hash);
    }
  }

  deleteExpiredSessions(now: Date): number {
    let deleted = 0;

    for (const [hash, session] of this.sessions) {
      if (session.expiresAt.getTime() >= now.getTime()) continue;
      this.sessions.delete(hash);
      deleted += 1;
    }

    return deleted;
  }

  findActiveApiToken(tokenHash: string): ApiToken | null {
    const token = this.apiTokens.get(tokenHash);

    return token?.revokedAt === null ? token : null;
  }

  findActiveApiTokenOf(userId: string): ApiToken | null {
    return this.getApiTokens(userId).find((t) => t.revokedAt === null) ?? null;
  }

  revokeUserApiToken(userId: string, now: Date = new Date()): boolean {
    const active = this.findActiveApiTokenOf(userId);

    if (!active) {
      return false;
    }

    active.revokedAt = now;

    return true;
  }

  issueApiToken(userId: string, now: Date): { token: ApiToken; value: string } {
    this.revokeUserApiToken(userId, now);

    return this.addApiToken(this.getUser(userId));
  }

  findActiveUserByUsername(username: string): User | null {
    return this.users.find((u) => u.username === username && !u.deleted) ?? null;
  }

  findActiveUserById(id: string): User | null {
    return this.users.find((u) => u.id === id && !u.deleted) ?? null;
  }

  listActiveUsers(): User[] {
    return this.users.filter((u) => !u.deleted).toSorted((a, b) => Number(a.id) - Number(b.id));
  }

  countActiveAdmins(): number {
    return this.users.filter((u) => u.role === "admin" && !u.deleted && !u.disabled).length;
  }

  insertUser(input: NewUserInput, usernameTaken: () => Error): User {
    if (this.findActiveUserByUsername(input.username)) {
      throw usernameTaken();
    }

    // `lastSeededUser` — только про `seed*`: пользователь, созданный через API, его не подменяет
    const seeded = this.lastUser;
    const user = this.createUser(
      input.role,
      { username: input.username, mustChangePassword: input.mustChangePassword },
      input.passwordHash,
    );

    this.lastUser = seeded;

    return user;
  }

  updateUser(id: string, patch: UserPatch): User | null {
    const user = this.findActiveUserById(id);

    if (!user) {
      return null;
    }

    if (patch.role !== undefined) user.role = patch.role;
    if (patch.disabled !== undefined) user.disabled = patch.disabled;

    if (patch.unlock) {
      user.failedAttempts = 0;
      user.lockedUntil = null;
    }

    user.updatedAt = new Date();

    return user;
  }

  setUserPassword(id: string, passwordHash: string, mustChangePassword: boolean): void {
    const user = this.users.find((u) => u.id === id);

    if (user) {
      Object.assign(user, { passwordHash, mustChangePassword, failedAttempts: 0, lockedUntil: null });
    }
  }

  softDeleteUser(id: string, now: Date): boolean {
    const user = this.findActiveUserById(id);

    if (!user) {
      return false;
    }

    Object.assign(user, { deleted: true, deletedAt: now });

    return true;
  }

  registerFailedLogin(id: string, now: Date, maxAttempts: number, lockMs: number): User | null {
    const user = this.findActiveUserById(id);

    if (!user) {
      return null;
    }

    user.failedAttempts += 1;

    if (user.failedAttempts >= maxAttempts) {
      user.failedAttempts = 0;
      user.lockedUntil = new Date(now.getTime() + lockMs);
    }

    return user;
  }

  registerSuccessfulLogin(id: string, now: Date): void {
    const user = this.users.find((u) => u.id === id);

    if (user) {
      Object.assign(user, { failedAttempts: 0, lockedUntil: null, lastLoginAt: now });
    }
  }
}

export const fakeAuth = new FakeAuth();

// ---------------------------------------------------------------- фабрики подменённых модулей

/** Содержимое подменённого `src/auth/repository/users.ts` (константы и ошибка — из оригинала). */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- тип подменяемого модуля выводится из тела
export function createUsersRepositoryModule(original: UsersRepositoryOriginal, db: FakeAuth = fakeAuth) {
  return {
    findActiveUserByUsername: (_ds: unknown, username: string) =>
      Promise.resolve(db.findActiveUserByUsername(username)),
    findActiveUserById: (_manager: unknown, id: string) => Promise.resolve(db.findActiveUserById(id)),
    listActiveUsers: () => Promise.resolve(db.listActiveUsers()),
    countActiveAdmins: () => Promise.resolve(db.countActiveAdmins()),
    createUser: (_ds: unknown, input: NewUserInput) =>
      Promise.resolve(db.insertUser(input, () => new original.UsernameTakenError(input.username))),
    updateUser: (_manager: unknown, id: string, patch: UserPatch) => Promise.resolve(db.updateUser(id, patch)),
    setUserPassword: (_manager: unknown, id: string, passwordHash: string, mustChangePassword: boolean) => {
      db.setUserPassword(id, passwordHash, mustChangePassword);

      return Promise.resolve();
    },
    softDeleteUser: (_manager: unknown, id: string, now: Date = new Date()) =>
      Promise.resolve(db.softDeleteUser(id, now)),
    registerFailedLogin: (_ds: unknown, id: string, now: Date = new Date()) =>
      Promise.resolve(db.registerFailedLogin(id, now, original.MAX_FAILED_LOGIN_ATTEMPTS, original.LOCK_DURATION_MS)),
    registerSuccessfulLogin: (_ds: unknown, id: string, now: Date = new Date()) => {
      db.registerSuccessfulLogin(id, now);

      return Promise.resolve();
    },
  };
}

/** Содержимое подменённого `src/auth/repository/sessions.ts`. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- тип подменяемого модуля выводится из тела
export function createSessionsRepositoryModule(original: SessionsRepositoryOriginal, db: FakeAuth = fakeAuth) {
  return {
    createSession: (_ds: unknown, input: NewSessionInput, now: Date = new Date()) =>
      Promise.resolve(db.createSession(input, now, original.SESSION_TTL_MS)),
    findSessionByTokenHash: (_ds: unknown, tokenHash: string) => Promise.resolve(db.findSession(tokenHash)),
    touchSession: () => Promise.resolve(false),
    deleteSession: (_ds: unknown, id: string) => {
      db.deleteSession(id);

      return Promise.resolve();
    },
    deleteUserSessions: (_manager: unknown, userId: string, exceptSessionId?: string) => {
      db.deleteUserSessions(userId, exceptSessionId);

      return Promise.resolve();
    },
    deleteExpiredSessions: (_ds: unknown, now: Date = new Date()) => Promise.resolve(db.deleteExpiredSessions(now)),
  };
}

/** Содержимое подменённого `src/auth/repository/api-tokens.ts`. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- тип подменяемого модуля выводится из тела
export function createApiTokensRepositoryModule(db: FakeAuth = fakeAuth) {
  return {
    findActiveApiToken: (_ds: unknown, userId: string) => Promise.resolve(db.findActiveApiTokenOf(userId)),
    findActiveApiTokenByHash: (_ds: unknown, tokenHash: string) => Promise.resolve(db.findActiveApiToken(tokenHash)),
    revokeUserApiToken: (_manager: unknown, userId: string, now: Date = new Date()) =>
      Promise.resolve(db.revokeUserApiToken(userId, now)),
    issueApiToken: (_ds: unknown, userId: string, now: Date = new Date()) =>
      Promise.resolve(db.issueApiToken(userId, now)),
    touchApiToken: () => Promise.resolve(false),
  };
}

/** Содержимое подменённого `src/auth/repository/audit.ts`. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- тип подменяемого модуля выводится из тела
export function createAuditRepositoryModule(db: FakeAuth = fakeAuth) {
  return {
    writeAuditEntry: (_ds: unknown, entry: AuditEntryInput) => {
      db.recordAuditEntry(entry);

      return Promise.resolve();
    },
    listAuditEntries: (_ds: unknown, options: AuditListOptions) => Promise.resolve(db.listAuditEntries(options)),
  };
}
