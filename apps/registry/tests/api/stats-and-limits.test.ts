import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

describe("статистика и лимиты", () => {
  let ctx: TestContext;

  // Счётчики rate-limit живут в памяти инстанса app, поэтому app строится заново на каждый тест.
  beforeEach(async () => {
    ctx = await buildTestApp();
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  const postInstall = (slug: string) =>
    ctx.app.inject({
      method: "POST",
      url: "/v1/stats/installs",
      headers: ctx.authHeader,
      payload: { slug, version: "1.0.0", cliVersion: "0.1.0" },
    });

  describe("POST /v1/stats/installs", () => {
    it("400 для неизвестной пары slug@version, событие не записывается", async () => {
      const slug = uniqueSlug("unknown");

      const response = await postInstall(slug);

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toContain(`${slug}@1.0.0`);
      expect(ctx.db.installEventsCount()).toBe(0);
    });

    it("202 {ok:true} для существующей версии, событие записывается", async () => {
      const slug = uniqueSlug("stat");
      const published = await publishPlugin(ctx.app, ctx.authHeader, { slug, version: "1.0.0" });
      expect(published.statusCode).toBe(201);

      const response = await postInstall(slug);

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ ok: true });
      expect(ctx.db.installEventsCount()).toBe(1);
    });

    it("21-й запрос в окне -> 429 (лимит 20 на ключ 127.0.0.1)", async () => {
      const slug = uniqueSlug("limit");

      // Лимит считается в onRequest, до валидации и хэндлера, поэтому годится и дешёвый 400.
      for (let i = 0; i < 20; i += 1) {
        const response = await postInstall(slug);
        expect(response.statusCode).toBe(400);
      }

      const limited = await postInstall(slug);

      expect(limited.statusCode).toBe(429);
    });
  });

  describe("write-эндпоинты /v1/admin/plugins*", () => {
    it("301-й запрос в минуту -> 429 (лимит 300)", async () => {
      const slug = uniqueSlug("nolimit");
      const deletePlugin = () =>
        ctx.app.inject({ method: "DELETE", url: `/v1/admin/plugins/${slug}`, headers: ctx.authHeader });

      // DELETE несуществующего плагина — самый дешёвый запрос (404 без записи в БД).
      const statuses: number[] = [];
      for (let i = 0; i < 300; i += 1) {
        statuses.push((await deletePlugin()).statusCode);
      }

      expect(statuses.filter((status) => status !== 404)).toEqual([]);

      const limited = await deletePlugin();

      expect(limited.statusCode).toBe(429);
    });
  });
});
