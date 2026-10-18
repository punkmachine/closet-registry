import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_FAILED_LOGIN_ATTEMPTS } from "../../src/auth/repository/users.js";
import { buildTestApp } from "../helpers/build-test-app.js";
import { DEFAULT_TEST_PASSWORD } from "../helpers/fake-auth.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

describe("POST /v1/auth/login", () => {
  let ctx: TestContext;

  const login = (username: string, password: string) =>
    ctx.app.inject({ method: "POST", url: "/v1/auth/login", payload: { username, password } });

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  describe("успешный вход", () => {
    it("отдаёт сессионный токен cls_… и пользователя без хеша пароля", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "alice" });
      const response = await login("alice", user.password);

      expect(response.statusCode).toBe(200);

      const body = response.json<{ token: string; expiresAt: string; user: Record<string, unknown> }>();

      expect(body.token).toMatch(/^cls_/);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(body.user).toMatchObject({ username: "alice", role: "developer", disabled: false });
      expect(body.user).not.toHaveProperty("passwordHash");
      expect(ctx.auth.getSessions(user.id)).toHaveLength(1);
    });

    it("выданный токен работает на защищённых роутах", async () => {
      const user = await ctx.auth.seedUser("guest", { username: "bob" });
      const { token } = (await login("bob", user.password)).json<{ token: string }>();
      const response = await ctx.app.inject({
        method: "GET",
        url: "/v1/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ user: { username: string } }>().user.username).toBe("bob");
    });

    it("проставляет lastLoginAt и пишет аудит auth.login", async () => {
      const user = await ctx.auth.seedUser("guest", { username: "carol" });

      await login("carol", user.password);

      expect(ctx.auth.getUser(user.id).lastLoginAt).toBeInstanceOf(Date);
      expect(ctx.auth.getAuditEntries()).toEqual([
        expect.objectContaining({ action: "auth.login", actorId: user.id, actorUsername: "carol" }),
      ]);
    });

    it("сбрасывает счётчик неудачных попыток", async () => {
      const user = await ctx.auth.seedUser("guest", { username: "dave", failedAttempts: 3 });

      await login("dave", user.password);

      expect(ctx.auth.getUser(user.id).failedAttempts).toBe(0);
    });

    it("пользователь с must_change_password входит, но получает флаг в ответе", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "erin", mustChangePassword: true });
      const response = await login("erin", user.password);

      expect(response.statusCode).toBe(200);
      expect(response.json<{ user: { mustChangePassword: boolean } }>().user.mustChangePassword).toBe(true);
    });
  });

  describe("неверные данные", () => {
    it("неверный пароль и несуществующий логин дают одинаковый 401", async () => {
      const user = await ctx.auth.seedUser("guest", { username: "frank" });
      const wrongPassword = await login("frank", "Wrong-pass-1!");
      const unknownUser = await login("nobody", user.password);

      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownUser.statusCode).toBe(401);
      expect(wrongPassword.json()).toEqual({ error: "Invalid credentials" });
      expect(unknownUser.json()).toEqual(wrongPassword.json());
      expect(ctx.auth.getSessions(user.id)).toHaveLength(0);
    });

    it("неудачи пишутся в аудит: у неизвестного логина actorId = null", async () => {
      const user = await ctx.auth.seedUser("guest", { username: "grace" });

      await login("grace", "Wrong-pass-1!");
      await login("ghost", "Wrong-pass-1!");

      expect(ctx.auth.getAuditEntries()).toEqual([
        expect.objectContaining({ action: "auth.login_failed", actorId: user.id, actorUsername: "grace" }),
        expect.objectContaining({ action: "auth.login_failed", actorId: null, actorUsername: "ghost" }),
      ]);
    });

    it("удалённый пользователь не входит (как несуществующий)", async () => {
      const user = await ctx.auth.seedUser("guest", { username: "heidi", deleted: true });
      const response = await login("heidi", user.password);

      expect(response.statusCode).toBe(401);
    });

    it.each([
      ["пустое тело", {}],
      ["без пароля", { username: "x" }],
      ["пустой логин", { username: "", password: "x" }],
    ])("%s -> 400", async (_name, payload) => {
      const response = await ctx.app.inject({ method: "POST", url: "/v1/auth/login", payload });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("блокировка после серии неудач", () => {
    it(`${String(MAX_FAILED_LOGIN_ATTEMPTS)}-я неудача -> 403 account_locked с Retry-After`, async () => {
      const user = await ctx.auth.seedUser("developer", { username: "ivan" });

      for (let attempt = 1; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
        expect((await login("ivan", "Wrong-pass-1!")).statusCode).toBe(401);
      }

      const locked = await login("ivan", "Wrong-pass-1!");

      expect(locked.statusCode).toBe(403);
      expect(locked.json()).toEqual({ error: "Account is temporarily locked", code: "account_locked" });
      expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
      expect(Number(locked.headers["retry-after"])).toBeLessThanOrEqual(15 * 60);
      expect(ctx.auth.getUser(user.id).lockedUntil).toBeInstanceOf(Date);
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({ action: "auth.login_locked", actorId: user.id });
    });

    it("во время блокировки верный пароль тоже не пускает и не создаёт сессию", async () => {
      const user = await ctx.auth.seedUser("developer", {
        username: "judy",
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });
      const response = await login("judy", user.password);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "account_locked" });
      expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
      expect(ctx.auth.getSessions(user.id)).toHaveLength(0);
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
        action: "auth.login_blocked",
        details: { reason: "locked" },
      });
    });

    it("неверный пароль во время блокировки не продлевает её и не увеличивает счётчик", async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000);
      const user = await ctx.auth.seedUser("developer", { username: "karl", lockedUntil });

      await login("karl", "Wrong-pass-1!");

      expect(ctx.auth.getUser(user.id)).toMatchObject({ lockedUntil, failedAttempts: 0 });
    });

    it("после истечения блокировки верный пароль пускает и снимает lockedUntil", async () => {
      const user = await ctx.auth.seedUser("developer", {
        username: "liam",
        lockedUntil: new Date(Date.now() - 1000),
      });
      const response = await login("liam", user.password);

      expect(response.statusCode).toBe(200);
      expect(ctx.auth.getUser(user.id).lockedUntil).toBeNull();
    });

    it("успешный вход посреди серии обнуляет счётчик", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "mia" });

      for (let attempt = 1; attempt < MAX_FAILED_LOGIN_ATTEMPTS; attempt += 1) {
        await login("mia", "Wrong-pass-1!");
      }

      expect((await login("mia", user.password)).statusCode).toBe(200);
      expect((await login("mia", "Wrong-pass-1!")).statusCode).toBe(401);
    });
  });

  describe("отключённый админом аккаунт", () => {
    it("верный пароль -> 403 account_disabled без Retry-After", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "nina", disabled: true });
      const response = await login("nina", user.password);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Account is disabled", code: "account_disabled" });
      expect(response.headers["retry-after"]).toBeUndefined();
      expect(ctx.auth.getSessions(user.id)).toHaveLength(0);
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
        action: "auth.login_blocked",
        details: { reason: "disabled" },
      });
    });

    it("отказ приходит и при неверном пароле (проверка идёт до сверки пароля)", async () => {
      await ctx.auth.seedUser("developer", { username: "oscar", disabled: true });
      const response = await login("oscar", "Wrong-pass-1!");

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "account_disabled" });
    });
  });

  it("логин ограничен по IP: после 10 запросов за окно -> 429", async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await login("nobody", DEFAULT_TEST_PASSWORD)).statusCode);
    }

    expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 401));
    expect(statuses[10]).toBe(429);
  });
});
