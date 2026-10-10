import { describe, expect, it } from "vitest";

import { detectEncoding } from "../../src/routes/plugins.js";

describe("detectEncoding", () => {
  it("валидный UTF-8 (в т.ч. кириллица) отдаёт как utf8", () => {
    const text = "привет, world";
    expect(detectEncoding(Buffer.from(text, "utf8"))).toEqual({ encoding: "utf8", text });
  });

  it("пустой буфер — utf8 с пустой строкой", () => {
    expect(detectEncoding(Buffer.alloc(0))).toEqual({ encoding: "utf8", text: "" });
  });

  it("бинарные данные, не переживающие round-trip, отдаёт как base64", () => {
    const binary = Buffer.from([0xff, 0xfe, 0x00, 0x80]);
    expect(detectEncoding(binary)).toEqual({ encoding: "base64", text: binary.toString("base64") });
  });

  it("обрезанная многобайтная последовательность считается бинарной", () => {
    expect(detectEncoding(Buffer.from([0xd0])).encoding).toBe("base64");
  });
});
