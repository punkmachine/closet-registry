import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;
type AuthHeader = Record<string, string>;

const TEMP_PASSWORD = "Temp-pass-123!";

interface UserBody {
  id: string;
  username: string;
  role: string;
  disabled: boolean;
  mustChangePassword: boolean;
}

describe("/v1/admin/users и /v1/admin/audit", () => {
  let ctx: TestContext;

  const call = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, headers: AuthHeader, payload?: object) =>
    ctx.app.inject({ method, url, headers, payload });
  const adminCall = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) =>
    call(method, url, ctx.authHeader, payload);
  const get = (headers: AuthHeader, url = "/v1/plugins") => call("GET", url, headers);
  const login = (username: string, password: string) =>
    ctx.app.inject({ method: "POST", url: "/v1/auth/login", payload: { username, password } });

  beforeEach(async () => {
    ctx = await buildTestApp({ role: "admin" });
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  describe("POST /users", () => {
    it("создаёт пользователя с must_change_password и пишет аудит", async () => {
      const response = await adminCall("POST", "/v1/admin/users", {
        username: "newbie",
        password: TEMP_PASSWORD,
        role: "developer",
      });

      expect(response.statusCode).toBe(201);

      const { user } = response.json<{ user: UserBody }>();

      expect(user).toMatchObject({ username: "newbie", role: "developer", disabled: false, mustChangePassword: true });
      expect(JSON.stringify(response.json())).not.toContain("passwordHash");
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
        action: "user.create",
        targetType: "user",
        targetId: user.id,
        actorId: ctx.auth.lastSeededUser().id,
        details: { username: "newbie", role: "developer" },
      });
    });

    it("новый пользователь входит временным паролем, но до смены пароля заблокирован", async () => {
      await adminCall("POST", "/v1/admin/users", { username: "newbie", password: TEMP_PASSWORD, role: "guest" });

      const session = await login("newbie", TEMP_PASSWORD);

      expect(session.statusCode).toBe(200);

      const headers = { authorization: `Bearer ${session.json<{ token: string }>().token}` };

      expect((await get(headers)).json()).toMatchObject({ code: "password_change_required" });
      expect((await get(headers, "/v1/auth/me")).statusCode).toBe(200);
    });

    it("занятый логин -> 409", async () => {
      const body = { username: "newbie", password: TEMP_PASSWORD, role: "guest" };

      await adminCall("POST", "/v1/admin/users", body);

      const duplicate = await adminCall("POST", "/v1/admin/users", body);

      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toEqual({ error: "User newbie already exists" });
    });

    it("логин удалённого пользователя можно занять снова", async () => {
      const body = { username: "newbie", password: TEMP_PASSWORD, role: "guest" };
      const { user } = (await adminCall("POST", "/v1/admin/users", body)).json<{ user: UserBody }>();

      await adminCall("DELETE", `/v1/admin/users/${user.id}`);

      expect((await adminCall("POST", "/v1/admin/users", body)).statusCode).toBe(201);
    });

    it.each([
      ["пароль длиной 8", { username: "newbie", password: "Abcd-123", role: "guest" }],
      ["пароль без спецсимвола", { username: "newbie", password: "Abcdefgh12", role: "guest" }],
      ["роль admin (назначать нельзя)", { username: "newbie", password: TEMP_PASSWORD, role: "admin" }],
      ["заглавные буквы в логине", { username: "NewBie", password: TEMP_PASSWORD, role: "guest" }],
      ["слишком короткий логин", { username: "ab", password: TEMP_PASSWORD, role: "guest" }],
    ])("%s -> 400, пользователь не создаётся", async (_name, payload) => {
      const response = await adminCall("POST", "/v1/admin/users", payload);

      expect(response.statusCode).toBe(400);
      expect(ctx.auth.getUserByUsername(payload.username)).toBeUndefined();
    });
  });

  describe("GET /users", () => {
    it("отдаёт не удалённых пользователей по возрастанию id без хешей паролей", async () => {
      ctx.auth.seedApiUser("guest", { username: "visible" });
      ctx.auth.seedApiUser("guest", { username: "removed", deleted: true });

      const response = await adminCall("GET", "/v1/admin/users");
      const { users } = response.json<{ users: UserBody[] }>();

      expect(response.statusCode).toBe(200);
      expect(users.map((user) => user.username)).toEqual([ctx.auth.getUser("1").username, "visible"]);
      expect(JSON.stringify(users)).not.toContain("passwordHash");
    });
  });

  describe("PATCH /users/:id", () => {
    it("смена роли действует сразу и отзывает сессии и токен пользователя", async () => {
      const developer = ctx.auth.seedApiUser("developer");
      const session = ctx.auth.seedSessionFor(developer.user);

      expect((await get(developer.authHeader)).statusCode).toBe(200);

      const response = await adminCall("PATCH", `/v1/admin/users/${developer.user.id}`, { role: "guest" });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ user: UserBody }>().user.role).toBe("guest");
      expect((await get(developer.authHeader)).statusCode).toBe(401);
      expect((await get(session.authHeader)).statusCode).toBe(401);
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
        action: "user.update",
        details: { role: { from: "developer", to: "guest" } },
      });
    });

    it("смена роли на ту же самую ничего не отзывает", async () => {
      const developer = ctx.auth.seedApiUser("developer");

      await adminCall("PATCH", `/v1/admin/users/${developer.user.id}`, { role: "developer" });

      expect((await get(developer.authHeader)).statusCode).toBe(200);
    });

    it("новая роль применяется после повторного входа", async () => {
      const user = await ctx.auth.seedUser("guest", { username: "grow" });

      await adminCall("PATCH", `/v1/admin/users/${user.id}`, { role: "developer" });

      const { token } = (await login("grow", user.password)).json<{ token: string }>();
      const publish = await publishPlugin(
        ctx.app,
        { authorization: `Bearer ${token}` },
        { slug: uniqueSlug("promoted"), version: "1.0.0" },
      );

      expect(publish.statusCode).toBe(201);
    });

    it("блокировка мгновенно ломает токен и сессию, а вход -> 403 account_disabled", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "target" });
      const api = ctx.auth.seedApiTokenFor(user);
      const session = ctx.auth.seedSessionFor(user);

      const response = await adminCall("PATCH", `/v1/admin/users/${user.id}`, { disabled: true });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ user: UserBody }>().user.disabled).toBe(true);
      expect((await get(api.authHeader)).statusCode).toBe(401);
      expect((await get(session.authHeader)).statusCode).toBe(401);

      const attempt = await login("target", user.password);

      expect(attempt.statusCode).toBe(403);
      expect(attempt.json()).toMatchObject({ code: "account_disabled" });
    });

    it("разблокировка возвращает возможность входа (токен остаётся отозванным)", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "target", disabled: true });

      await adminCall("PATCH", `/v1/admin/users/${user.id}`, { disabled: false });

      expect((await login("target", user.password)).statusCode).toBe(200);
    });

    it("unlock снимает временную блокировку входа и обнуляет счётчик", async () => {
      const user = await ctx.auth.seedUser("developer", {
        username: "target",
        failedAttempts: 2,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });

      expect((await login("target", user.password)).statusCode).toBe(403);

      const response = await adminCall("PATCH", `/v1/admin/users/${user.id}`, { unlock: true });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ user: UserBody }>().user).toMatchObject({ lockedUntil: null });
      expect(ctx.auth.getUser(user.id)).toMatchObject({ failedAttempts: 0, lockedUntil: null });
      expect((await login("target", user.password)).statusCode).toBe(200);
    });

    it("unlock не отзывает действующие токены", async () => {
      const api = ctx.auth.seedApiUser("developer");

      await adminCall("PATCH", `/v1/admin/users/${api.user.id}`, { unlock: true });

      expect((await get(api.authHeader)).statusCode).toBe(200);
    });

    it.each([
      ["пустое тело", {}],
      ["роль admin", { role: "admin" }],
      ["unlock: false", { unlock: false }],
    ])("%s -> 400", async (_name, payload) => {
      const target = ctx.auth.seedApiUser("guest");
      const response = await adminCall("PATCH", `/v1/admin/users/${target.user.id}`, payload);

      expect(response.statusCode).toBe(400);
    });

    it("несуществующий и удалённый пользователь -> 404", async () => {
      const removed = ctx.auth.seedApiUser("guest", { deleted: true });

      expect((await adminCall("PATCH", "/v1/admin/users/999", { disabled: true })).statusCode).toBe(404);
      expect((await adminCall("PATCH", `/v1/admin/users/${removed.user.id}`, { disabled: true })).statusCode).toBe(404);
    });

    describe("защита admin", () => {
      it("admin не может сменить роль у себя -> 403", async () => {
        const response = await adminCall("PATCH", `/v1/admin/users/${ctx.auth.lastSeededUser().id}`, {
          role: "developer",
        });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: "Cannot change own role" });
        expect(ctx.auth.lastSeededUser().role).toBe("admin");
      });

      it("нельзя заблокировать последнего активного admin -> 409", async () => {
        const response = await adminCall("PATCH", `/v1/admin/users/${ctx.auth.lastSeededUser().id}`, {
          disabled: true,
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ error: "Cannot remove the last active admin" });
        expect(ctx.auth.lastSeededUser().disabled).toBe(false);
        expect((await get(ctx.authHeader)).statusCode).toBe(200);
      });

      it("заблокированный admin не считается: последним активным остаётся тот, кто не заблокирован", async () => {
        const second = ctx.auth.seedApiUser("admin");
        const first = ctx.auth.getUser("1");

        expect(
          (await call("PATCH", `/v1/admin/users/${first.id}`, second.authHeader, { disabled: true })).statusCode,
        ).toBe(200);

        const response = await call("PATCH", `/v1/admin/users/${second.user.id}`, second.authHeader, {
          disabled: true,
        });

        expect(response.statusCode).toBe(409);
      });

      it("admin может заблокировать другого admin, если остаётся ещё один активный", async () => {
        const second = ctx.auth.seedApiUser("admin");
        const response = await adminCall("PATCH", `/v1/admin/users/${second.user.id}`, { disabled: true });

        expect(response.statusCode).toBe(200);
        expect((await get(second.authHeader)).statusCode).toBe(401);
      });

      it("другого admin можно разжаловать, если остаётся ещё один активный", async () => {
        const second = ctx.auth.seedApiUser("admin");
        const demote = await adminCall("PATCH", `/v1/admin/users/${second.user.id}`, { role: "developer" });

        expect(demote.statusCode).toBe(200);
        expect(ctx.auth.getUser(second.user.id).role).toBe("developer");
      });

      it("developer и guest не доходят до PATCH -> 403", async () => {
        const developer = ctx.auth.seedApiUser("developer");
        const target = ctx.auth.seedApiUser("guest");
        const response = await call("PATCH", `/v1/admin/users/${target.user.id}`, developer.authHeader, {
          disabled: true,
        });

        expect(response.statusCode).toBe(403);
        expect(ctx.auth.getUser(target.user.id).disabled).toBe(false);
      });
    });
  });

  describe("POST /users/:id/reset-password", () => {
    it("задаёт временный пароль: must_change_password, старый пароль не подходит", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "target" });
      const response = await adminCall("POST", `/v1/admin/users/${user.id}/reset-password`, {
        password: TEMP_PASSWORD,
      });

      expect(response.statusCode).toBe(204);
      expect((await login("target", user.password)).statusCode).toBe(401);

      const attempt = await login("target", TEMP_PASSWORD);

      expect(attempt.statusCode).toBe(200);
      expect(attempt.json<{ user: UserBody }>().user.mustChangePassword).toBe(true);
    });

    it("отзывает все сессии и токен пользователя", async () => {
      const user = await ctx.auth.seedUser("developer");
      const api = ctx.auth.seedApiTokenFor(user);
      const session = ctx.auth.seedSessionFor(user);

      await adminCall("POST", `/v1/admin/users/${user.id}/reset-password`, { password: TEMP_PASSWORD });

      expect((await get(api.authHeader)).statusCode).toBe(401);
      expect((await get(session.authHeader)).statusCode).toBe(401);
    });

    it("снимает временную блокировку входа", async () => {
      const user = await ctx.auth.seedUser("developer", {
        username: "target",
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });

      await adminCall("POST", `/v1/admin/users/${user.id}/reset-password`, { password: TEMP_PASSWORD });

      expect((await login("target", TEMP_PASSWORD)).statusCode).toBe(200);
    });

    it("пишет аудит user.reset_password без пароля в деталях", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "target" });

      await adminCall("POST", `/v1/admin/users/${user.id}/reset-password`, { password: TEMP_PASSWORD });

      const entry = ctx.auth.getAuditEntries().at(-1);

      expect(entry).toMatchObject({
        action: "user.reset_password",
        targetId: user.id,
        details: { username: "target" },
      });
      expect(JSON.stringify(entry)).not.toContain(TEMP_PASSWORD);
    });

    it("слабый пароль -> 400, несуществующий пользователь -> 404", async () => {
      const user = await ctx.auth.seedUser("developer");

      expect(
        (await adminCall("POST", `/v1/admin/users/${user.id}/reset-password`, { password: "Abcd-123" })).statusCode,
      ).toBe(400);
      expect(
        (await adminCall("POST", "/v1/admin/users/999/reset-password", { password: TEMP_PASSWORD })).statusCode,
      ).toBe(404);
    });
  });

  describe("DELETE /users/:id", () => {
    it("мягко удаляет: пропадает из списка, вход -> 401, токен и сессия -> 401", async () => {
      const user = await ctx.auth.seedUser("developer", { username: "target" });
      const api = ctx.auth.seedApiTokenFor(user);
      const session = ctx.auth.seedSessionFor(user);

      expect((await adminCall("DELETE", `/v1/admin/users/${user.id}`)).statusCode).toBe(204);
      expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
        action: "user.delete",
        targetId: user.id,
        details: { username: "target" },
      });

      const { users } = (await adminCall("GET", "/v1/admin/users")).json<{ users: UserBody[] }>();

      expect(users.map((entry) => entry.username)).not.toContain("target");
      expect((await login("target", user.password)).statusCode).toBe(401);
      expect((await get(api.authHeader)).statusCode).toBe(401);
      expect((await get(session.authHeader)).statusCode).toBe(401);
      expect(ctx.auth.getUser(user.id).deleted).toBe(true);
    });

    it("плагины удалённого автора сохраняют его имя", async () => {
      const developer = ctx.auth.seedApiUser("developer", { username: "former" });
      const slug = uniqueSlug("kept");

      await publishPlugin(ctx.app, developer.authHeader, { slug, version: "1.0.0" });
      await adminCall("DELETE", `/v1/admin/users/${developer.user.id}`);

      const bundle = await adminCall("GET", `/v1/plugins/${slug}/latest`);

      expect(bundle.json()).toMatchObject({ createdBy: { username: "former" }, updatedBy: { username: "former" } });
    });

    it("нельзя удалить последнего активного admin -> 409", async () => {
      const response = await adminCall("DELETE", `/v1/admin/users/${ctx.auth.lastSeededUser().id}`);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "Cannot remove the last active admin" });
      expect(ctx.auth.lastSeededUser().deleted).toBe(false);
    });

    it("можно удалить admin, если остаётся другой активный", async () => {
      const second = ctx.auth.seedApiUser("admin");

      expect((await adminCall("DELETE", `/v1/admin/users/${second.user.id}`)).statusCode).toBe(204);
    });

    it("заблокированный admin не спасает: единственный активный admin не удаляется", async () => {
      ctx.auth.seedApiUser("admin", { disabled: true });

      const response = await adminCall("DELETE", `/v1/admin/users/${ctx.auth.getUser("1").id}`);

      expect(response.statusCode).toBe(409);
    });

    it("несуществующий и уже удалённый пользователь -> 404", async () => {
      const removed = ctx.auth.seedApiUser("guest", { deleted: true });

      expect((await adminCall("DELETE", "/v1/admin/users/999")).statusCode).toBe(404);
      expect((await adminCall("DELETE", `/v1/admin/users/${removed.user.id}`)).statusCode).toBe(404);
    });
  });

  describe("GET /audit", () => {
    const seedAuditTrail = async (count: number) => {
      for (let index = 0; index < count; index += 1) {
        await adminCall("POST", "/v1/admin/users", {
          username: `user-${String(index)}`,
          password: TEMP_PASSWORD,
          role: "guest",
        });
      }
    };

    it("отдаёт записи от новых к старым с полным набором полей", async () => {
      await seedAuditTrail(2);

      const response = await adminCall("GET", "/v1/admin/audit");
      const { entries } = response.json<{ entries: { id: string; action: string; details: unknown }[] }>();

      expect(response.statusCode).toBe(200);
      expect(entries).toHaveLength(2);
      expect(Number(entries[0]?.id)).toBeGreaterThan(Number(entries[1]?.id));
      expect(entries[0]).toMatchObject({
        action: "user.create",
        actorUsername: ctx.auth.getUser("1").username,
        targetType: "user",
        details: { username: "user-1", role: "guest" },
        createdAt: expect.any(String) as unknown,
      });
    });

    it("limit обрезает выдачу, before отдаёт следующую страницу без пересечений", async () => {
      await seedAuditTrail(5);

      const first = (await adminCall("GET", "/v1/admin/audit?limit=2")).json<{ entries: { id: string }[] }>().entries;
      const lastId = first.at(-1)?.id ?? "";
      const second = (await adminCall("GET", `/v1/admin/audit?limit=2&before=${lastId}`)).json<{
        entries: { id: string }[];
      }>().entries;

      expect(first).toHaveLength(2);
      expect(second).toHaveLength(2);
      expect(second.every((entry) => Number(entry.id) < Number(lastId))).toBe(true);
    });

    it.each(["limit=0", "limit=201", "limit=abc"])("некорректный параметр %s -> 400", async (query) => {
      expect((await adminCall("GET", `/v1/admin/audit?${query}`)).statusCode).toBe(400);
    });
  });
});
