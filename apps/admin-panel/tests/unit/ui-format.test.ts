import { describe, expect, it } from "vitest";
import { formatBytes, formatDate } from "../../../../packages/ui/src/format.js";

describe("formatBytes", () => {
  it("значения меньше 1024 выводит в байтах", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("граница 1024 переключает на KB", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("граница 1 MiB переключает на MB", () => {
    expect(formatBytes(1024 * 1024 - 1)).toMatch(/KB$/);
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("принимает числовую строку", () => {
    expect(formatBytes("2048")).toBe("2.0 KB");
    expect(formatBytes("10")).toBe("10 B");
  });

  it("возвращает прочерк для NaN, Infinity и нечисловой строки", () => {
    expect(formatBytes(NaN)).toBe("—");
    expect(formatBytes(Infinity)).toBe("—");
    expect(formatBytes("abc")).toBe("—");
  });
});

describe("formatDate", () => {
  it("невалидную строку возвращает как есть", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDate("")).toBe("");
  });

  it("валидную ISO-дату форматирует в ru-RU (без привязки к таймзоне)", () => {
    // полдень середины года: год и месяц не уезжают при любой таймзоне
    const result = formatDate("2024-06-15T12:00:00Z");

    expect(result).not.toBe("2024-06-15T12:00:00Z");
    expect(result).toMatch(/\d{2}\.\d{2}\.2024/);
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});
