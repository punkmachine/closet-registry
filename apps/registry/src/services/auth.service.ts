import type { ChangePasswordBody, LoginBody } from "@closet/contract";
import type { DataSource } from "typeorm";
import { hashPassword, needsRehash, verifyDummyPassword, verifyPassword } from "../auth/password.js";
import type { AuditEvent } from "../auth/record-audit.js";
import { createSession, deleteUserSessions } from "../auth/repository/sessions.js";
import {
  findActiveUserByUsername,
  registerFailedLogin,
  registerSuccessfulLogin,
  setUserPassword,
} from "../auth/repository/users.js";
import { generateSessionToken } from "../auth/tokens.js";
import type { AuthContext } from "../auth/types.js";
import type { User } from "../db/entities/index.js";
import { AccountDisabledError, AccountLockedError, BadRequestError, UnauthorizedError } from "../errors/http-error.js";

const MAX_USER_AGENT_LENGTH = 512;

export interface LoginContext {
  ip: string | null;
  userAgent: string | null;
  audit: (actor: { id: string | null; username: string }, event: AuditEvent) => Promise<void>;
  now?: Date;
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: User;
}

export interface AuthService {
  login: (body: LoginBody, context: LoginContext) => Promise<LoginResult>;
  changePassword: (auth: AuthContext, body: ChangePasswordBody) => Promise<void>;
}

function secondsUntil(target: Date, now: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
}

/**
 * Вход и смена пароля.
 *
 * @remarks Порядок проверок при входе: несуществующий логин (фиктивный scrypt для выравнивания по времени) →
 * отключён админом → временная блокировка → пароль. Блокировка проверяется до пароля, чтобы во время неё
 * пароль не подбирался. Неверный логин и неверный пароль дают одинаковый `401`.
 */
export function createAuthService(orm: DataSource): AuthService {
  return {
    async login(body, context) {
      const now = context.now ?? new Date();
      const user = await findActiveUserByUsername(orm, body.username);

      if (!user) {
        await verifyDummyPassword(body.password);
        await context.audit({ id: null, username: body.username }, { action: "auth.login_failed" });

        throw new UnauthorizedError("Invalid credentials");
      }

      const actor = { id: user.id, username: user.username };

      if (user.disabled) {
        await context.audit(actor, { action: "auth.login_blocked", details: { reason: "disabled" } });

        throw new AccountDisabledError();
      }

      if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
        await context.audit(actor, { action: "auth.login_blocked", details: { reason: "locked" } });

        throw new AccountLockedError(secondsUntil(user.lockedUntil, now));
      }

      if (!(await verifyPassword(body.password, user.passwordHash))) {
        const updated = await registerFailedLogin(orm, user.id, now);

        if (updated?.lockedUntil && updated.lockedUntil.getTime() > now.getTime()) {
          await context.audit(actor, { action: "auth.login_locked" });

          throw new AccountLockedError(secondsUntil(updated.lockedUntil, now));
        }

        await context.audit(actor, { action: "auth.login_failed" });

        throw new UnauthorizedError("Invalid credentials");
      }

      if (needsRehash(user.passwordHash)) {
        await setUserPassword(orm, user.id, await hashPassword(body.password), user.mustChangePassword);
      }

      await registerSuccessfulLogin(orm, user.id, now);

      const generated = generateSessionToken();
      const session = await createSession(
        orm,
        {
          userId: user.id,
          tokenHash: generated.hash,
          userAgent: context.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
          ip: context.ip,
        },
        now,
      );

      await context.audit(actor, { action: "auth.login" });

      Object.assign(user, { failedAttempts: 0, lockedUntil: null, lastLoginAt: now });

      return { token: generated.value, expiresAt: session.expiresAt, user };
    },

    async changePassword(auth, body) {
      const { user } = auth;

      if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw new BadRequestError("Current password is incorrect");
      }

      if (body.currentPassword === body.newPassword) {
        throw new BadRequestError("New password must differ from the current one");
      }

      await setUserPassword(orm, user.id, await hashPassword(body.newPassword), false);
      await deleteUserSessions(orm, user.id, auth.kind === "session" ? auth.credentialId : undefined);

      Object.assign(user, { mustChangePassword: false });
    },
  };
}
