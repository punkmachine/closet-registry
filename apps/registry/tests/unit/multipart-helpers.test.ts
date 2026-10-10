import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formatZodError, parseMetadataJson } from "../../src/registry/multipart-helpers.js";

describe("parseMetadataJson", () => {
  it("разбирает валидный JSON-объект", () => {
    expect(parseMetadataJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("разбирает JSON-примитив (валидация схемой — дело вызывающего)", () => {
    expect(parseMetadataJson("null")).toEqual({ ok: true, value: null });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["число", 42],
    ["объект", {}],
    ["Buffer", Buffer.from("{}")],
  ])("не-строка (%s) -> ошибка об отсутствии поля", (_name, raw) => {
    expect(parseMetadataJson(raw)).toEqual({ ok: false, error: "Missing required 'metadata' field" });
  });

  it("невалидный JSON -> ошибка парсинга", () => {
    expect(parseMetadataJson("{not json")).toEqual({
      ok: false,
      error: "'metadata' field must contain valid JSON",
    });
  });

  it("пустая строка -> ошибка парсинга", () => {
    expect(parseMetadataJson("")).toEqual({ ok: false, error: "'metadata' field must contain valid JSON" });
  });
});

describe("formatZodError", () => {
  it("форматирует issue с путём как «path: message»", () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatZodError(result.error)).toMatch(/^Validation error: name: .+/);
  });

  it("соединяет вложенный путь точками, включая индексы массива", () => {
    const result = z.object({ files: z.array(z.object({ path: z.string() })) }).safeParse({ files: [{ path: 1 }] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(formatZodError(result.error)).toMatch(/^Validation error: files\.0\.path: /);
  });

  it("issue без пути — только сообщение", () => {
    const result = z.string().safeParse(1);
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = formatZodError(result.error);
    expect(message.startsWith("Validation error: ")).toBe(true);
    // нет префикса «путь: » (путь — идентификаторы через точки), сразу сообщение zod
    expect(message).not.toMatch(/^Validation error: [\w.]+: /);
  });

  it("несколько issue разделяются «; »", () => {
    const result = z.object({ a: z.string(), b: z.string() }).safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const message = formatZodError(result.error);
    expect(message).toContain("a: ");
    expect(message).toContain("; b: ");
  });
});
