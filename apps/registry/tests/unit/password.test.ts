import { describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyDummyPassword, verifyPassword } from "../../src/auth/password.js";

describe("hashPassword / verifyPassword", () => {
  it("хеш имеет формат scrypt$N$r$p$salt$hash", async () => {
    const hash = await hashPassword("correct-horse!");
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("принимает верный пароль и отвергает неверный", async () => {
    const hash = await hashPassword("correct-horse!");
    expect(await verifyPassword("correct-horse!", hash)).toBe(true);
    expect(await verifyPassword("wrong-horse!", hash)).toBe(false);
  });

  it("соль случайна: один пароль даёт разные хеши", async () => {
    const [first, second] = await Promise.all([hashPassword("same-pass!"), hashPassword("same-pass!")]);
    expect(first).not.toBe(second);
  });

  it("нераспознанный формат хеша — false, а не исключение", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$10$abc$def")).toBe(false);
    expect(await verifyPassword("x", "scrypt$0$8$1$c2FsdA==$aGFzaA==")).toBe(false);
    expect(await verifyPassword("x", "scrypt$16384$8$1$c2FsdA==$")).toBe(false);
  });

  it("хеш другой длины не совпадает", async () => {
    const hash = await hashPassword("correct-horse!");
    const truncated = hash.split("$", 5).concat("YWJj").join("$");
    expect(await verifyPassword("correct-horse!", truncated)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("свежий хеш пересчитывать не нужно", async () => {
    expect(needsRehash(await hashPassword("correct-horse!"))).toBe(false);
  });

  it("другие параметры или мусор — нужно", async () => {
    const hash = await hashPassword("correct-horse!");
    const [prefix, , r, p, salt, key] = hash.split("$", 6);
    expect(needsRehash([prefix, 8192, r, p, salt, key].join("$"))).toBe(true);
    expect(needsRehash("not-a-hash")).toBe(true);
  });
});

describe("verifyDummyPassword", () => {
  it("завершается без исключения", async () => {
    await expect(verifyDummyPassword("whatever")).resolves.toBeUndefined();
  });
});
