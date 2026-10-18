import type { UserRole } from "@closet/contract";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Полный список /v1/* роутов (src/routes/stats.ts, plugins.ts, admin-plugins.ts) и минимальная роль для каждого.
 * При добавлении нового роута его нужно дописать сюда: именно этот список страхует инвариант
 * «токен обязателен на всех /v1/*» (однажды он уже ломался из-за отсутствия fp()).
 * Auth-хук и guard срабатывают в onRequest, до валидации, поэтому тела запросов не нужны:
 * «пропущен» = любой статус, кроме 401/403.
 */
const V1_ROUTES: readonly (readonly [HttpMethod, string, UserRole])[] = [
  ["POST", "/v1/stats/installs", "guest"],
  ["GET", "/v1/plugins", "guest"],
  ["GET", "/v1/plugins/some-slug/versions", "guest"],
  ["GET", "/v1/plugins/some-slug/1.0.0", "guest"],
  ["POST", "/v1/admin/plugins", "developer"],
  ["PUT", "/v1/admin/plugins/some-slug/1.0.0", "developer"],
  ["DELETE", "/v1/admin/plugins/some-slug/1.0.0", "admin"],
  ["DELETE", "/v1/admin/plugins/some-slug", "admin"],
];

const ROLE_RANK: Record<UserRole, number> = { guest: 0, developer: 1, admin: 2 };
const ROLES: readonly UserRole[] = ["guest", "developer", "admin"];

describe("авторизация", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  describe.each(V1_ROUTES)("%s %s (минимум: %s)", (method, url, minRole) => {
    it("без заголовка Authorization -> 401", async () => {
      const response = await ctx.app.inject({ method, url });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "Unauthorized" });
    });

    it.each(["x".repeat(20), "clt_unknown", "cls_unknown"])("неизвестный токен %s -> 401", async (value) => {
      const response = await ctx.app.inject({ method, url, headers: { authorization: `Bearer ${value}` } });

      expect(response.statusCode).toBe(401);
    });

    it("токен без префикса Bearer -> 401", async () => {
      const response = await ctx.app.inject({ method, url, headers: { authorization: ctx.token } });

      expect(response.statusCode).toBe(401);
    });

    it.each(ROLES.filter((role) => ROLE_RANK[role] >= ROLE_RANK[minRole]))("роль %s пропущена", async (role) => {
      const { authHeader } = ctx.auth.seedApiUser(role);
      const response = await ctx.app.inject({ method, url, headers: authHeader });

      expect([401, 403]).not.toContain(response.statusCode);
    });

    it.each(ROLES.filter((role) => ROLE_RANK[role] < ROLE_RANK[minRole]))("роль %s -> 403", async (role) => {
      const { authHeader } = ctx.auth.seedApiUser(role);
      const response = await ctx.app.inject({ method, url, headers: authHeader });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Forbidden" });
    });
  });

  it("пустой токен после Bearer -> 401", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/v1/plugins", headers: { authorization: "Bearer " } });

    expect(response.statusCode).toBe(401);
  });

  it("префикс Bearer без пробела с верным токеном -> 401", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/v1/plugins",
      headers: { authorization: `Bearer${ctx.token}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it("верный токен проходит auth (контроль, что 401 выше не из-за сломанного хелпера)", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/v1/plugins", headers: ctx.authHeader });

    expect(response.statusCode).toBe(200);
  });

  describe("сессии и токены", () => {
    const get = (headers: { authorization: string }) => ctx.app.inject({ method: "GET", url: "/v1/plugins", headers });

    it("сессия cls_… принимается", async () => {
      const { authHeader } = ctx.auth.seedSessionUser("guest");

      expect((await get(authHeader)).statusCode).toBe(200);
    });

    it("просроченная сессия -> 401", async () => {
      const { authHeader } = ctx.auth.seedSessionUser("admin", { expiresAt: new Date(Date.now() - 1000) });

      expect((await get(authHeader)).statusCode).toBe(401);
    });

    it("отозванный API-токен -> 401", async () => {
      ctx.auth.revokeApiTokens();

      expect((await get(ctx.authHeader)).statusCode).toBe(401);
    });

    it.each([
      ["заблокированный админом", { disabled: true }],
      ["удалённый", { deleted: true }],
    ])("API-токен %s пользователя -> 401", async (_name, options) => {
      const { authHeader } = ctx.auth.seedApiUser("admin", options);

      expect((await get(authHeader)).statusCode).toBe(401);
    });

    it("сессия заблокированного пользователя -> 401", async () => {
      const { authHeader } = ctx.auth.seedSessionUser("admin", { disabled: true });

      expect((await get(authHeader)).statusCode).toBe(401);
    });
  });

  describe("must_change_password", () => {
    it("блокирует обычные роуты: 403 с кодом password_change_required", async () => {
      const { authHeader } = ctx.auth.seedApiUser("admin", { mustChangePassword: true });
      const response = await ctx.app.inject({ method: "GET", url: "/v1/plugins", headers: authHeader });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Password change required", code: "password_change_required" });
    });
  });

  it("GET /health без токена -> 200, db: ok (pg замокан)", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: "ok" });
  });

  it("GET /health при недоступной БД -> 200, db: error", async () => {
    ctx.db.setHealthy(false);

    const response = await ctx.app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: "error" });
  });
});
