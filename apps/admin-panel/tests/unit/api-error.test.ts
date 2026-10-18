import { describe, expect, it } from "vitest";
import { errorCode, formatWait, retryAfterSeconds } from "~/utils/api-error";

describe("api-error", () => {
  it("достаёт code из data.data.code", () => {
    expect(errorCode({ data: { data: { code: "account_locked" } } })).toBe("account_locked");
    expect(errorCode({ data: {} })).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it("читает Retry-After", () => {
    const error = { response: { headers: new Headers({ "retry-after": "900" }) } };

    expect(retryAfterSeconds(error)).toBe(900);
    expect(retryAfterSeconds({ response: { headers: new Headers() } })).toBeUndefined();
    expect(retryAfterSeconds({})).toBeUndefined();
  });

  it("форматирует ожидание", () => {
    expect(formatWait(900)).toBe("15 мин");
    expect(formatWait(61)).toBe("2 мин");
    expect(formatWait(40)).toBe("40 сек");
  });
});
