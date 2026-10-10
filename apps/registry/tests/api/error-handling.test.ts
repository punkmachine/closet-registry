import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestApp } from "../helpers/build-test-app.js";
import { uniqueSlug } from "../helpers/database.js";
import { publishPlugin, updatePlugin } from "../helpers/multipart.js";

type TestContext = Awaited<ReturnType<typeof buildTestApp>>;

describe("обработка ошибок", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await buildTestApp();
    ctx.db.reset();
  });

  afterEach(async () => {
    await ctx.dispose();
  });

  it("zod validation error -> 400 с префиксом `Validation error:`", async () => {
    // Версия в URL не semver — ошибку выбрасывает validatorCompiler, её ловит setErrorHandler.
    const response = await updatePlugin(ctx.app, ctx.authHeader, uniqueSlug("badver"), "1.0", {});

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/^Validation error: /);
  });

  it("PathTraversalError из file-store -> 400, а не 500", async () => {
    // relativePath проходит схему (только min(1)); `rules/../../evil.md` выходит за каталог версии (одного `..` мало: он остаётся внутри).
    const response = await publishPlugin(ctx.app, ctx.authHeader, {
      slug: uniqueSlug("traversal"),
      version: "1.0.0",
      files: [{ component: "rules", relativePath: "../../evil.md", content: "x" }],
    });

    expect(response.statusCode).toBe(400);
    expect(response.statusCode).not.toBe(500);
    expect(typeof response.json<{ error: unknown }>().error).toBe("string");
  });

  it("неизвестный роут -> 404 { error: 'Not Found' }", async () => {
    const outsideV1 = await ctx.app.inject({ method: "GET", url: "/no-such-route", headers: ctx.authHeader });
    expect(outsideV1.statusCode).toBe(404);
    expect(outsideV1.json()).toEqual({ error: "Not Found" });

    const insideV1 = await ctx.app.inject({ method: "GET", url: "/v1/no-such-route", headers: ctx.authHeader });
    expect(insideV1.statusCode).toBe(404);
    expect(insideV1.json()).toEqual({ error: "Not Found" });
  });

  // ТЕКУЩЕЕ поведение: тело 500 содержит текст исходной ошибки (error.message уходит клиенту).
  // Ожидаемо меняется после SEC-04 (этап 06): тогда тело должно быть без текста ошибки,
  // например { error: "Internal Server Error" }, и этот тест нужно будет обновить.
  it("внутренняя ошибка -> 500 (сейчас в теле текст исходной ошибки)", async () => {
    const secret = "boom: secret internal details";
    // Одноразовый сбой слоя данных надёжнее spyOn по ESM-неймспейсу file-store и проходит через настоящий роут.
    ctx.db.failNext("publishPluginVersion", new Error(secret));

    const response = await publishPlugin(ctx.app, ctx.authHeader, { slug: uniqueSlug("internal"), version: "1.0.0" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: secret });
  });
});
