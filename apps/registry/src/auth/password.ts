import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const HASH_PREFIX = "scrypt";

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

const scryptAsync = promisify<string, Buffer, number, ScryptOptions, Buffer>(scrypt);

async function deriveKey(password: string, salt: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return await scryptAsync(password, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r });
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");

  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) {
    return null;
  }

  const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  const valid = saltRaw && hashRaw && [N, r, p].every((value) => Number.isSafeInteger(value) && value > 0);

  return valid
    ? {
        N,
        r,
        p,
        salt: Buffer.from(saltRaw, "base64"),
        hash: Buffer.from(hashRaw, "base64"),
      }
    : null;
}

/**
 * Хеширует пароль через scrypt. Формат результата: `scrypt$N$r$p$salt$hash` (salt и hash — base64).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const { N, r, p } = SCRYPT_PARAMS;
  const derived = await deriveKey(password, salt, N, r, p);
  return [HASH_PREFIX, N, r, p, salt.toString("base64"), derived.toString("base64")].join("$");
}

/**
 * Сверяет пароль с сохранённым хешем за константное время. Нераспознанный формат хеша — `false`, не исключение.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);

  if (!parsed || parsed.hash.length === 0) {
    return false;
  }

  const derived = await deriveKey(password, parsed.salt, parsed.N, parsed.r, parsed.p);

  return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
}

/**
 * `true`, если хеш создан с параметрами, отличными от текущих (или нераспознан) и его стоит пересчитать при входе.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);

  if (!parsed) {
    return true;
  }

  const { N, r, p } = SCRYPT_PARAMS;

  return parsed.N !== N || parsed.r !== r || parsed.p !== p || parsed.hash.length !== KEY_LENGTH;
}

let dummyHash: Promise<string> | undefined;

/**
 * Тратит столько же времени, сколько обычная проверка пароля. Для входа под несуществующим логином:
 * иначе по времени ответа видно, есть ли такой пользователь.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(SALT_LENGTH).toString("hex"));

  await verifyPassword(password, await dummyHash);
}
