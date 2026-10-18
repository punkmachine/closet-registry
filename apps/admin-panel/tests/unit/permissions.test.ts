import { describe, expect, it } from "vitest";
import { resolveAuthRedirect, roleCan } from "~/utils/permissions";

const admin = { role: "admin", mustChangePassword: false } as const;
const guest = { role: "guest", mustChangePassword: false } as const;

describe("roleCan", () => {
  it("права берутся из ROLE_PERMISSIONS контракта", () => {
    expect(roleCan("admin", "plugins", "delete")).toBe(true);
    expect(roleCan("developer", "plugins", "write")).toBe(true);
    expect(roleCan("developer", "plugins", "delete")).toBe(false);
    expect(roleCan("guest", "plugins", "write")).toBe(false);
    expect(roleCan("guest", "plugins", "read")).toBe(true);
    expect(roleCan("developer", "users", "read")).toBe(false);
  });

  it("без роли прав нет", () => {
    expect(roleCan(undefined, "plugins", "read")).toBe(false);
  });
});

describe("resolveAuthRedirect", () => {
  it("гость без сессии уходит на /login, публичная страница открыта", () => {
    expect(resolveAuthRedirect({ user: null, path: "/", isPublic: false })).toBe("/login");
    expect(resolveAuthRedirect({ user: null, path: "/login", isPublic: true })).toBeNull();
  });

  it("вошедший со /login уходит на главную", () => {
    expect(resolveAuthRedirect({ user: admin, path: "/login", isPublic: true })).toBe("/");
  });

  it("mustChangePassword запирает на /account", () => {
    const user = { role: "developer", mustChangePassword: true } as const;

    expect(resolveAuthRedirect({ user, path: "/", isPublic: false })).toBe("/account");
    expect(resolveAuthRedirect({ user, path: "/account", isPublic: false })).toBeNull();
  });

  it("закрывает страницу по праву страницы", () => {
    const permission = { resource: "users", action: "read" } as const;

    expect(resolveAuthRedirect({ user: guest, path: "/admin/users", isPublic: false, permission })).toBe("/");
    expect(resolveAuthRedirect({ user: admin, path: "/admin/users", isPublic: false, permission })).toBeNull();
  });
});
