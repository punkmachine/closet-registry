import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { DEFAULT_TEST_PASSWORD } from "../helpers/fake-auth.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;
type AuthHeader = Record<string, string>;

const NEW_PASSWORD = "Brand-new-pass-9?";

describe("/v1/auth: токен, выход, смена пароля", () => {
  let ctx: TestContext;

  const request = (method: "GET" | "POST" | "DELETE", url: string, headers: AuthHeader, payload?: object) =>
    ctx.app.inject({ method, url, headers, payload });

  beforeEach(async () => {
    ctx = await buildTestApp({ role: "guest" });
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  describe("API-токен", () => {
    it("GET /auth/token без токена пользователя -> { token: null }", async () => {
      const { authHeader } = ctx.auth.seedSessionUser("developer");
      const response = await request("GET", "/v1/auth/token", authHeader);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ token: null });
    });

    it("POST выпускает clt_… один раз; GET потом отдаёт только метаданные без значения", async () => {
      const { authHeader, user } = ctx.auth.seedSessionUser("developer");
      const issued = await request("POST", "/v1/auth/token", authHeader);

      expect(issued.statusCode).toBe(201);

      const { value, prefix } = issued.json<{ value: string; prefix: string }>();

      expect(value).toMatch(/^clt_/);
      expect(value.startsWith(prefix)).toBe(true);

      const meta = await request("GET", "/v1/auth/token", authHeader);

      expect(meta.json()).toEqual({
        token: { prefix, createdAt: expect.any(String) as unknown, lastUsedAt: null },
      });
      expect(JSON.stringify(meta.json())).not.toContain(value);
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
        action: "auth.token_issued",
        actorId: user.id,
        details: { prefix },
      });
    });

    it("выпущенный токен работает как Bearer", async () => {
      const { authHeader } = ctx.auth.seedSessionUser("developer");
      const { value } = (await request("POST", "/v1/auth/token", authHeader)).json<{ value: string }>();
      const response = await request("GET", "/v1/plugins", { authorization: `Bearer ${value}` });

      expect(response.statusCode).toBe(200);
    });

    it("перевыпуск отзывает старый токен: старый -> 401, новый работает", async () => {
      const { authHeader } = ctx.auth.seedSessionUser("developer");
      const first = (await request("POST", "/v1/auth/token", authHeader)).json<{ value: string }>().value;
      const second = (await request("POST", "/v1/auth/token", authHeader)).json<{ value: string }>().value;

      expect(second).not.toBe(first);
      expect((await request("GET", "/v1/plugins", { authorization: `Bearer ${first}` })).statusCode).toBe(401);
      expect((await request("GET", "/v1/plugins", { authorization: `Bearer ${second}` })).statusCode).toBe(200);
    });

    it("активен только один токен на пользователя", async () => {
      const { authHeader, user } = ctx.auth.seedSessionUser("developer");

      await request("POST", "/v1/auth/token", authHeader);
      await request("POST", "/v1/auth/token", authHeader);

      const tokens = ctx.auth.getApiTokens(user.id);

      expect(tokens).toHaveLength(2);
      expect(tokens.filter((token) => token.revokedAt === null)).toHaveLength(1);
    });

    it("токен можно перевыпустить и под самим API-токеном", async () => {
      const developer = ctx.auth.seedApiUser("developer");
      const response = await request("POST", "/v1/auth/token", developer.authHeader);

      expect(response.statusCode).toBe(201);
      expect((await request("GET", "/v1/plugins", developer.authHeader)).statusCode).toBe(401);
    });

    it("токены пользователей изолированы: чужой токен не виден и не отзывается", async () => {
      const alice = ctx.auth.seedSessionUser("developer");
      const bob = ctx.auth.seedSessionUser("developer");
      const aliceToken = (await request("POST", "/v1/auth/token", alice.authHeader)).json<{ value: string }>().value;

      expect((await request("GET", "/v1/auth/token", bob.authHeader)).json()).toEqual({ token: null });

      await request("DELETE", "/v1/auth/token", bob.authHeader);

      expect((await request("GET", "/v1/plugins", { authorization: `Bearer ${aliceToken}` })).statusCode).toBe(200);
    });

    it("DELETE отзывает токен (-> 204, токен -> 401, аудит), повторный DELETE идемпотентен без аудита", async () => {
      const { authHeader } = ctx.auth.seedSessionUser("developer");
      const { value } = (await request("POST", "/v1/auth/token", authHeader)).json<{ value: string }>();

      expect((await request("DELETE", "/v1/auth/token", authHeader)).statusCode).toBe(204);
      expect((await request("GET", "/v1/plugins", { authorization: `Bearer ${value}` })).statusCode).toBe(401);
      expect((await request("GET", "/v1/auth/token", authHeader)).json()).toEqual({ token: null });

      const auditCount = ctx.auth.getAuditEntries().length;

      expect((await request("DELETE", "/v1/auth/token", authHeader)).statusCode).toBe(204);
      expect(ctx.auth.getAuditEntries()).toHaveLength(auditCount);
      expect(ctx.auth.getAuditEntries().map((entry) => entry.action)).toContain("auth.token_revoked");
    });
  });

  describe("выход", () => {
    it("отзывает текущую сессию: токен потом -> 401; аудит auth.logout", async () => {
      const { authHeader, user } = ctx.auth.seedSessionUser("developer");

      expect((await request("POST", "/v1/auth/logout", authHeader)).statusCode).toBe(204);
      expect((await request("GET", "/v1/auth/me", authHeader)).statusCode).toBe(401);
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({ action: "auth.logout", actorId: user.id });
    });

    it("не трогает другие сессии пользователя", async () => {
      const first = ctx.auth.seedSessionUser("developer");
      const second = ctx.auth.seedSessionFor(first.user);

      await request("POST", "/v1/auth/logout", first.authHeader);

      expect((await request("GET", "/v1/auth/me", second.authHeader)).statusCode).toBe(200);
    });

    it("под API-токеном -> 204, но токен остаётся рабочим и аудита нет", async () => {
      const developer = ctx.auth.seedApiUser("developer");

      expect((await request("POST", "/v1/auth/logout", developer.authHeader)).statusCode).toBe(204);
      expect((await request("GET", "/v1/plugins", developer.authHeader)).statusCode).toBe(200);
      expect(ctx.auth.getAuditEntries()).toEqual([]);
    });
  });

  describe("смена пароля", () => {
    const change = (headers: AuthHeader, currentPassword: string, newPassword: string) =>
      request("POST", "/v1/auth/change-password", headers, { currentPassword, newPassword });

    it("меняет пароль: войти можно только с новым", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "pat" });
      const { token } = ctx.auth.seedSessionFor(user);
      const response = await change({ authorization: `Bearer ${token}` }, user.password, NEW_PASSWORD);

      expect(response.statusCode).toBe(204);

      const login = (password: string) =>
        ctx.app.inject({ method: "POST", url: "/v1/auth/login", payload: { username: "pat", password } });

      expect((await login(DEFAULT_TEST_PASSWORD)).statusCode).toBe(401);
      expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    });

    it("отзывает чужие сессии, текущая остаётся", async () => {
      const user = await ctx.auth.seedUser("developer");
      const current = ctx.auth.seedSessionFor(user);
      const other = ctx.auth.seedSessionFor(user);

      await change(current.authHeader, user.password, NEW_PASSWORD);

      expect((await request("GET", "/v1/auth/me", current.authHeader)).statusCode).toBe(200);
      expect((await request("GET", "/v1/auth/me", other.authHeader)).statusCode).toBe(401);
    });

    it("сбрасывает must_change_password: после смены остальные роуты открываются", async () => {
      const user = await ctx.auth.seedUser("developer", { mustChangePassword: true });
      const { authHeader } = ctx.auth.seedSessionFor(user);

      expect((await request("GET", "/v1/plugins", authHeader)).statusCode).toBe(403);
      expect((await change(authHeader, user.password, NEW_PASSWORD)).statusCode).toBe(204);
      expect((await request("GET", "/v1/plugins", authHeader)).statusCode).toBe(200);
    });

    it("неверный текущий пароль -> 400, пароль не меняется", async () => {
      const user = await ctx.auth.seedUser("developer");
      const { authHeader } = ctx.auth.seedSessionFor(user);
      const response = await change(authHeader, "Wrong-pass-1!", NEW_PASSWORD);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "Current password is incorrect" });
      expect(ctx.auth.getUser(user.id).passwordHash).toBe(user.passwordHash);
    });

    it("новый пароль равен текущему -> 400", async () => {
      const user = await ctx.auth.seedUser("developer");
      const { authHeader } = ctx.auth.seedSessionFor(user);
      const response = await change(authHeader, user.password, user.password);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "New password must differ from the current one" });
    });

    it.each([
      ["длина 8 (≤ 8)", "Abcd-123"],
      ["без спецсимвола", "Abcdefgh1234"],
      ["длиннее 128", `${"a".repeat(128)}!`],
    ])("слабый новый пароль: %s -> 400", async (_name, newPassword) => {
      const user = await ctx.auth.seedUser("developer");
      const { authHeader } = ctx.auth.seedSessionFor(user);
      const response = await change(authHeader, user.password, newPassword);

      expect(response.statusCode).toBe(400);
      expect(ctx.auth.getUser(user.id).passwordHash).toBe(user.passwordHash);
    });

    it("длина ровно 9 со спецсимволом принимается", async () => {
      const user = await ctx.auth.seedUser("developer");
      const { authHeader } = ctx.auth.seedSessionFor(user);

      expect((await change(authHeader, user.password, "Abcd-1234")).statusCode).toBe(204);
    });

    it("пишет аудит auth.password_changed", async () => {
      const user = await ctx.auth.seedUser("developer");
      const { authHeader } = ctx.auth.seedSessionFor(user);

      await change(authHeader, user.password, NEW_PASSWORD);

      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
        action: "auth.password_changed",
        actorId: user.id,
      });
    });
  });
});
