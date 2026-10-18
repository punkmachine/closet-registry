import { PASSWORD_SPECIAL_CHARS, passwordSchema } from "@closet/contract";
import { describe, expect, it } from "vitest";
import { GENERATED_PASSWORD_LENGTH, generatePassword } from "~/utils/password";

describe("generatePassword", () => {
  it("даёт пароль длиной 16, проходящий passwordSchema, на множестве запусков", () => {
    for (let run = 0; run < 500; run++) {
      const password = generatePassword();

      expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
      expect(passwordSchema.safeParse(password).success).toBe(true);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password.split("").some((char) => PASSWORD_SPECIAL_CHARS.includes(char))).toBe(true);
    }
  });

  it("не использует Math.random: всё берётся из переданного источника", () => {
    let calls = 0;
    const password = generatePassword(16, (array) => {
      calls++;
      array[0] = 7;
      return array;
    });

    expect(calls).toBeGreaterThan(0);
    expect(password).toHaveLength(16);
  });

  it("отбрасывает значения из смещённого хвоста диапазона", () => {
    const values = [0xff_ff_ff_ff, 3];
    let call = 0;
    const result = generatePassword(4, (array) => {
      array[0] = values[call++] ?? 3;
      return array;
    });

    expect(result).toHaveLength(4);
  });

  it("уважает заданную длину", () => {
    expect(generatePassword(32)).toHaveLength(32);
  });
});
