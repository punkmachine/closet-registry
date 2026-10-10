import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Полный список /v1/* роутов (src/routes/stats.ts, plugins.ts, admin-plugins.ts).
 * При добавлении нового роута его нужно дописать сюда: именно этот список страхует инвариант
 * «токен обязателен на всех /v1/*» (однажды он уже ломался из-за отсутствия fp()).
 * Auth-хук срабатывает в onRequest, до валидации, поэтому тела запросов не нужны.
 */
const V1_ROUTES: readonly (readonly [HttpMethod, string])[] = [
  ["POST", "/v1/stats/installs"],
  ["GET", "/v1/plugins"],
  ["GET", "/v1/plugins/some-slug/versions"],
  ["GET", "/v1/plugins/some-slug/1.0.0"],
  ["POST", "/v1/admin/plugins"],
  ["PUT", "/v1/admin/plugins/some-slug/1.0.0"],
  ["DELETE", "/v1/admin/plugins/some-slug/1.0.0"],
  ["DELETE", "/v1/admin/plugins/some-slug"],
];

describe("авторизация", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  describe.each(V1_ROUTES)("%s %s", (method, url) => {
    it("без заголовка Authorization -> 401", async () => {
      const response = await ctx.app.inject({ method, url });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "Unauthorized" });
    });

    it("неверный токен той же длины -> 401", async () => {
      const wrong = "x".repeat(ctx.token.length);
      const response = await ctx.app.inject({ method, url, headers: { authorization: `Bearer ${wrong}` } });

      expect(response.statusCode).toBe(401);
    });

    it("токен другой длины -> 401", async () => {
      const response = await ctx.app.inject({ method, url, headers: { authorization: `Bearer ${ctx.token}extra` } });

      expect(response.statusCode).toBe(401);
    });

    it("токен без префикса Bearer -> 401", async () => {
      const response = await ctx.app.inject({ method, url, headers: { authorization: ctx.token } });

      expect(response.statusCode).toBe(401);
    });
  });

  it("токен короче настоящего -> 401 (ветка length !== без исключения от timingSafeEqual)", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/v1/plugins",
      headers: { authorization: `Bearer ${ctx.token.slice(0, -1)}` },
    });

    expect(response.statusCode).toBe(401);
  });

  it("пустой токен после Bearer -> 401", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/v1/plugins",
      headers: { authorization: "Bearer " },
    });

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

describe("запуск без ADMIN_TOKEN", () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
  });

  // typeorm/postgres-плагины замоканы (tests/setup/mock-db.ts): закрывать нечего, только восстанавливаем env.
  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = originalToken;
    }
  });

  it("buildApp() падает при старте с ADMIN_TOKEN is not set", async () => {
    const { buildApp } = await import("../../src/app.js");

    await expect(buildApp()).rejects.toThrow("ADMIN_TOKEN is not set");
  });
});
