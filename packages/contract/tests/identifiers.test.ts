import { describe, expect, it } from "vitest";

import { semverSchema, slugSchema } from "../src/index.js";

describe("slugSchema", () => {
  it.each(["C:", "a:b", "..", "Foo", "", "a".repeat(65)])("отклоняет %j", (value) => {
    expect(slugSchema.safeParse(value).success).toBe(false);
  });

  it.each(["demo-list-test", "a.b_c-1", "a".repeat(64)])("принимает %j", (value) => {
    expect(slugSchema.safeParse(value).success).toBe(true);
  });

  it("отклоняет '..' внутри slug (refine)", () => {
    expect(slugSchema.safeParse("a..b").success).toBe(false);
  });
});

describe("semverSchema", () => {
  it.each(["latest", "1.0"])("отклоняет %j", (value) => {
    expect(semverSchema.safeParse(value).success).toBe(false);
  });

  it('принимает "v1.0.0": semver.valid() срезает префикс v (текущее поведение схемы)', () => {
    expect(semverSchema.safeParse("v1.0.0").success).toBe(true);
  });

  it.each(["1.0.0", "1.0.0-rc.1"])("принимает %j", (value) => {
    expect(semverSchema.safeParse(value).success).toBe(true);
  });
});
