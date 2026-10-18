import { PASSWORD_SPECIAL_CHARS } from "@closet/contract";

export const GENERATED_PASSWORD_LENGTH = 16;

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";

export type FillRandom = (array: Uint32Array) => Uint32Array;

/**
 * Равномерный индекс в `[0, max)` без смещения по модулю: значения из «хвоста» диапазона отбрасываются.
 */
function randomIndex(max: number, fill: FillRandom): number {
  const limit = Math.floor(0x1_00_00_00_00 / max) * max;
  const buffer = new Uint32Array(1);

  for (;;) {
    const value = fill(buffer)[0] ?? 0;

    if (value < limit) {
      return value % max;
    }
  }
}

function pick(alphabet: string, fill: FillRandom): string {
  return alphabet.charAt(randomIndex(alphabet.length, fill));
}

/**
 * Генерирует пароль: гарантированно содержит строчную, заглавную, цифру и спецсимвол из набора контракта,
 * остальное добирается из объединённого алфавита; порядок перемешивается (Fisher–Yates).
 * Похожие символы (`0/O`, `1/l/I`) в алфавит не входят: пароль часто переписывают глазами.
 * @param length - длина результата (не меньше 4)
 * @param fill - источник случайности, по умолчанию `crypto.getRandomValues`
 */
export function generatePassword(
  length: number = GENERATED_PASSWORD_LENGTH,
  fill: FillRandom = (array) => crypto.getRandomValues(array),
): string {
  const all = LOWER + UPPER + DIGITS + PASSWORD_SPECIAL_CHARS;
  const chars = [pick(LOWER, fill), pick(UPPER, fill), pick(DIGITS, fill), pick(PASSWORD_SPECIAL_CHARS, fill)];

  while (chars.length < length) {
    chars.push(pick(all, fill));
  }

  for (let index = chars.length - 1; index > 0; index--) {
    const swap = randomIndex(index + 1, fill);
    const current = chars[index] ?? "";

    chars[index] = chars[swap] ?? "";
    chars[swap] = current;
  }

  return chars.join("");
}
