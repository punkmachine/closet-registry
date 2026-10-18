import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SPECIAL_CHARS,
  passwordSchema,
  ROLE_PERMISSIONS,
  usernameSchema,
} from "../src/index.js";

describe("passwordSchema", () => {
  it("минимальная длина — строго больше 8 символов", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(9);
  });

  it.each([
    ["длина 8 со спецсимволом", "Abcd-123"],
    ["без спецсимвола", "Abcdefgh123"],
    ["пустой", ""],
    ["длиннее максимума", `${"a".repeat(PASSWORD_MAX_LENGTH)}!`],
  ])("отклоняет: %s", (_name, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["ровно 9 символов", "Abcd-1234"],
    ["ровно максимум", `${"a".repeat(PASSWORD_MAX_LENGTH - 1)}!`],
  ])("принимает: %s", (_name, value) => {
    expect(passwordSchema.safeParse(value).success).toBe(true);
  });

  it.each(PASSWORD_SPECIAL_CHARS.split(""))("каждый спецсимвол из набора засчитывается: %s", (char) => {
    expect(passwordSchema.safeParse(`abcdefgh${char}`).success).toBe(true);
  });
});

describe("usernameSchema", () => {
  it.each(["ab", "Alice", "a b", "a".repeat(33), "юзер"])("отклоняет %j", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });

  it.each(["abc", "a.b_c-1", "a".repeat(32)])("принимает %j", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });
});

describe("ROLE_PERMISSIONS (матрица прав из плана)", () => {
  it("guest только читает плагины", () => {
    expect(ROLE_PERMISSIONS.guest).toEqual({ plugins: ["read"], users: [] });
  });

  it("developer читает и пишет плагины, но не удаляет и не управляет пользователями", () => {
    expect(ROLE_PERMISSIONS.developer.plugins).toEqual(["read", "write"]);
    expect(ROLE_PERMISSIONS.developer.users).toEqual([]);
  });

  it("admin удаляет плагины и полностью управляет пользователями", () => {
    expect(ROLE_PERMISSIONS.admin.plugins).toContain("delete");
    expect(ROLE_PERMISSIONS.admin.users).toEqual(["read", "write", "update", "delete"]);
  });
});
