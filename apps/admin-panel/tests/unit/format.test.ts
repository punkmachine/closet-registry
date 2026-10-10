import { describe, expect, it } from "vitest";
import { errorMessage } from "~/utils/format";

describe("errorMessage", () => {
  it("приоритет: data.message выигрывает у всех остальных", () => {
    const error = {
      data: { message: "from data.message", error: "from data.error" },
      statusMessage: "sm",
      message: "m",
    };
    expect(errorMessage(error)).toBe("from data.message");
  });

  it("без data.message берёт data.error", () => {
    expect(errorMessage({ data: { error: "from data.error" }, statusMessage: "sm", message: "m" })).toBe(
      "from data.error",
    );
  });

  it("без data берёт statusMessage", () => {
    expect(errorMessage({ statusMessage: "sm", message: "m" })).toBe("sm");
  });

  it("в последнюю очередь берёт message (Error)", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("пустые и нестроковые значения пропускаются", () => {
    expect(errorMessage({ data: { message: "", error: 42 }, statusMessage: "sm" })).toBe("sm");
  });

  it("null / undefined / пустая строка -> «Неизвестная ошибка»", () => {
    expect(errorMessage(null)).toBe("Неизвестная ошибка");
    expect(errorMessage(undefined)).toBe("Неизвестная ошибка");
    expect(errorMessage("")).toBe("Неизвестная ошибка");
  });

  it("неизвестная форма ошибки приводится к строке", () => {
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage({})).toBe("[object Object]");
  });
});
