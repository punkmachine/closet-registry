import { describe, expect, it } from "vitest";
import {
  detectTokenKind,
  generateApiToken,
  generateSessionToken,
  hashToken,
  tokenDisplayPrefix,
} from "../../src/auth/tokens.js";

describe("generateApiToken / generateSessionToken", () => {
  it("API-токен начинается с clt_, сессия — с cls_, дальше 32 байта base64url", () => {
    expect(generateApiToken().value).toMatch(/^clt_[A-Za-z0-9_-]{43}$/);
    expect(generateSessionToken().value).toMatch(/^cls_[A-Za-z0-9_-]{43}$/);
  });

  it("hash — sha256 значения в hex, значения уникальны", () => {
    const first = generateApiToken();
    const second = generateApiToken();
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toBe(hashToken(first.value));
    expect(first.value).not.toBe(second.value);
  });
});

describe("hashToken", () => {
  it("детерминирован; известный вектор sha256('abc')", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("tokenDisplayPrefix", () => {
  it("берёт первые 8 символов", () => {
    expect(tokenDisplayPrefix("clt_abcdefghijkl")).toBe("clt_abcd");
  });
});

describe("detectTokenKind", () => {
  it("различает токены по префиксу", () => {
    expect(detectTokenKind("clt_x")).toBe("api");
    expect(detectTokenKind("cls_x")).toBe("session");
    expect(detectTokenKind("other")).toBeNull();
  });
});
