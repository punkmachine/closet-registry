import type { UserRole } from "@closet/contract";
import { generateApiToken, generateSessionToken } from "../../src/auth/tokens.js";
import type { ApiToken } from "../../src/db/entities/api-token.entity.js";
import type { Session } from "../../src/db/entities/session.entity.js";
import type { User } from "../../src/db/entities/user.entity.js";

export interface SeedUserOptions {
  username?: string;
  mustChangePassword?: boolean;
  disabled?: boolean;
  deleted?: boolean;
}

export interface SeededCredential {
  user: User;
  token: string;
  authHeader: { authorization: string };
}

export class FakeAuth {
  private sessions = new Map<string, Session>();
  private apiTokens = new Map<string, ApiToken>();
  private idCounter = 0;

  private nextId(): string {
    this.idCounter += 1;
    return String(this.idCounter);
  }

  private createUser(role: UserRole, options: SeedUserOptions): User {
    const id = this.nextId();

    return {
      id,
      username: options.username ?? `${role}-${id}`,
      passwordHash: "x",
      role,
      disabled: options.disabled ?? false,
      mustChangePassword: options.mustChangePassword ?? false,
      failedAttempts: 0,
      lockedUntil: null,
      deleted: options.deleted ?? false,
      deletedAt: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  reset(): void {
    this.sessions.clear();
    this.apiTokens.clear();
    this.idCounter = 0;
  }

  seedApiUser(role: UserRole, options: SeedUserOptions = {}): SeededCredential {
    const user = this.createUser(role, options);
    const generated = generateApiToken();
    this.apiTokens.set(generated.hash, {
      id: this.nextId(),
      user,
      tokenHash: generated.hash,
      prefix: generated.value.slice(0, 8),
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { user, token: generated.value, authHeader: { authorization: `Bearer ${generated.value}` } };
  }

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

  revokeApiTokens(): void {
    for (const token of this.apiTokens.values()) {
      token.revokedAt = new Date();
    }
  }

  findSession(tokenHash: string): Session | null {
    return this.sessions.get(tokenHash) ?? null;
  }

  findActiveApiToken(tokenHash: string): ApiToken | null {
    const token = this.apiTokens.get(tokenHash);

    return token?.revokedAt === null ? token : null;
  }
}

export const fakeAuth = new FakeAuth();
