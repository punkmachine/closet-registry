import type { PermissionAction, PermissionResource, UserRole } from "@closet/contract";
import { describe, expect, it } from "vitest";
import { getAuth, hasPermission, requirePermission } from "../../src/auth/guards.js";
import type { AuthContext } from "../../src/auth/types.js";
import type { User } from "../../src/db/entities/user.entity.js";
import { ForbiddenError, UnauthorizedError } from "../../src/errors/http-error.js";

function authFor(role: UserRole): AuthContext {
  return { user: { id: "1", role } as User, kind: "api", credentialId: "1" };
}

describe("hasPermission", () => {
  const cases: readonly (readonly [UserRole, PermissionResource, PermissionAction, boolean])[] = [
    ["guest", "plugins", "read", true],
    ["guest", "plugins", "write", false],
    ["guest", "users", "read", false],
    ["developer", "plugins", "write", true],
    ["developer", "plugins", "delete", false],
    ["developer", "users", "read", false],
    ["admin", "plugins", "delete", true],
    ["admin", "users", "update", true],
    ["admin", "users", "delete", true],
  ];

  it.each(cases)("%s: %s.%s -> %s", (role, resource, action, expected) => {
    expect(hasPermission(role, resource, action)).toBe(expected);
  });
});

describe("getAuth", () => {
  it("возвращает контекст авторизации запроса", () => {
    const auth = authFor("guest");

    expect(getAuth({ auth })).toBe(auth);
  });

  it("запрос без контекста (хук не отработал) -> UnauthorizedError", () => {
    expect(() => getAuth({ auth: null })).toThrow(UnauthorizedError);
  });
});

describe("requirePermission", () => {
  it("пропускает роль с правом", async () => {
    await expect(requirePermission("plugins", "delete")({ auth: authFor("admin") })).resolves.toBeUndefined();
  });

  it("роль без права -> ForbiddenError", async () => {
    await expect(requirePermission("plugins", "delete")({ auth: authFor("developer") })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("без контекста авторизации -> UnauthorizedError, а не пропуск", async () => {
    await expect(requirePermission("plugins", "read")({ auth: null })).rejects.toThrow(UnauthorizedError);
  });
});
