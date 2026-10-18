import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin, updatePlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

describe("авторство и аудит", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp({ role: "developer" });
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("публикация проставляет автора и пишет аудит", async () => {
    const slug = uniqueSlug("author");
    const response = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });

    expect(response.statusCode).toBe(201);

    const { username } = ctx.auth.lastSeededUser();

    expect(response.json()).toMatchObject({ createdBy: { username }, updatedBy: { username } });
    expect(ctx.auth.getAuditEntries()).toEqual([
      expect.objectContaining({
        actorUsername: username,
        action: "plugin.publish",
        targetType: "plugin_version",
        targetId: `${slug}@1.0.0`,
      }),
    ]);
  });

  it("автор виден в листингах и bundle", async () => {
    const slug = uniqueSlug("author-read");

    await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });

    const { username } = ctx.auth.lastSeededUser();
    const author = { createdBy: { username }, updatedBy: { username } };

    const list = await ctx.app.inject({ method: "GET", url: "/v1/plugins", headers: ctx.authHeader });
    const versions = await ctx.app.inject({
      method: "GET",
      url: `/v1/plugins/${slug}/versions`,
      headers: ctx.authHeader,
    });
    const bundle = await ctx.app.inject({ method: "GET", url: `/v1/plugins/${slug}/latest`, headers: ctx.authHeader });

    expect(list.json<{ plugins: unknown[] }>().plugins).toEqual([expect.objectContaining(author)]);
    expect(versions.json<{ versions: unknown[] }>().versions).toEqual([expect.objectContaining(author)]);
    expect(bundle.json()).toMatchObject(author);
  });

  it("обновление меняет updatedBy, но не createdBy", async () => {
    const slug = uniqueSlug("author-update");
    const author = ctx.auth.lastSeededUser();

    await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });

    const editor = ctx.auth.seedApiUser("developer");
    const response = await updatePlugin(ctx.app, editor.authHeader, slug, "1.0.0");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      createdBy: { username: author.username },
      updatedBy: { username: editor.user.username },
    });
    expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
      actorUsername: editor.user.username,
      action: "plugin.update",
      targetId: `${slug}@1.0.0`,
    });
  });

  it("удаление пишет аудит от имени admin", async () => {
    const slug = uniqueSlug("audit-delete");
    const admin = ctx.auth.seedApiUser("admin");

    await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });

    const response = await ctx.app.inject({
      method: "DELETE",
      url: `/v1/admin/plugins/${slug}`,
      headers: admin.authHeader,
    });

    expect(response.statusCode).toBe(204);
    expect(ctx.auth.getAuditEntries().at(-1)).toMatchObject({
      actorUsername: admin.user.username,
      action: "plugin.delete",
      targetId: slug,
    });
  });

  it("неудачная операция не пишет аудит (удаление несуществующего плагина)", async () => {
    const admin = ctx.auth.seedApiUser("admin");
    const response = await ctx.app.inject({
      method: "DELETE",
      url: `/v1/admin/plugins/${uniqueSlug("ghost")}`,
      headers: admin.authHeader,
    });

    expect(response.statusCode).toBe(404);
    expect(ctx.auth.getAuditEntries()).toEqual([]);
  });
});

describe("/v1/auth", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp({ role: "guest" });
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("GET /auth/me без токена -> 401", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/v1/auth/me" });

    expect(response.statusCode).toBe(401);
  });

  it("GET /auth/me отдаёт текущего пользователя без хеша пароля", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/v1/auth/me", headers: ctx.authHeader });

    expect(response.statusCode).toBe(200);
    const { user } = response.json<{ user: Record<string, unknown> }>();

    expect(user).toMatchObject({ username: ctx.auth.lastSeededUser().username, role: "guest" });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("must_change_password: me доступен, остальное -> 403 password_change_required", async () => {
    const pending = ctx.auth.seedSessionUser("developer", { mustChangePassword: true });

    const me = await ctx.app.inject({ method: "GET", url: "/v1/auth/me", headers: pending.authHeader });
    const plugins = await ctx.app.inject({ method: "GET", url: "/v1/plugins", headers: pending.authHeader });

    expect(me.statusCode).toBe(200);
    expect(plugins.statusCode).toBe(403);
    expect(plugins.json()).toEqual({ error: "Password change required", code: "password_change_required" });
  });

  it("POST /auth/login с пустым телом -> 400 (роут публичный, без токена)", async () => {
    const response = await ctx.app.inject({ method: "POST", url: "/v1/auth/login", payload: {} });

    expect(response.statusCode).toBe(400);
  });
});
