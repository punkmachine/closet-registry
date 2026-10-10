import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { buildApp } from "../../src/app.js";
import { fakeDb } from "./fake-db.js";

export interface BuildTestAppOptions {
  /** Значение ADMIN_TOKEN; по умолчанию `test-token`. */
  token?: string;
}

/**
 * Поднимает приложение с изолированным хранилищем файлов и тестовым токеном.
 * БД нет: слой данных подменён in-memory `fakeDb` (vi.mock в tests/setup/mock-db.ts, setupFiles проекта
 * registry-api), плагины postgres/typeorm — заглушки. Состояние fake сбрасывается при каждой сборке приложения.
 * Возвращает `dispose`, который обязателен в afterEach: без него tmp-директории копятся.
 *
 * `REGISTRY_STORAGE_DIR` читается file-store лениво, но `buildApp` импортируется динамически,
 * чтобы env (в том числе ADMIN_TOKEN) был выставлен до загрузки модулей приложения.
 */
export interface TestApp {
  app: Awaited<ReturnType<typeof buildApp>>;
  /** In-memory fake БД: инспекция состояния и управление (setHealthy, failNext). */
  db: typeof fakeDb;
  storageDir: string;
  token: string;
  authHeader: { authorization: string };
  dispose: () => Promise<void>;
}

export interface TempStorageDir {
  storageDir: string;
  dispose: () => Promise<void>;
}

export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<TestApp> {
  const storageDir = await mkdtemp(path.join(tmpdir(), "closet-registry-test-"));
  const token = options.token ?? "test-token";
  process.env.REGISTRY_STORAGE_DIR = storageDir;
  process.env.ADMIN_TOKEN = token;
  fakeDb.reset();

  const { buildApp } = await import("../../src/app.js");
  const app = await buildApp();
  await app.ready();

  return {
    app,
    /** In-memory fake БД: инспекция состояния и управление (setHealthy, failNext). */
    db: fakeDb,
    storageDir,
    token,
    authHeader: { authorization: `Bearer ${token}` },
    async dispose() {
      await app.close();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

/** Создаёт tmp-каталог хранилища и направляет в него file-store (для unit-тестов без приложения). */
export async function useTempStorageDir(): Promise<TempStorageDir> {
  const storageDir = await mkdtemp(path.join(tmpdir(), "closet-registry-test-"));
  process.env.REGISTRY_STORAGE_DIR = storageDir;
  return {
    storageDir,
    async dispose() {
      delete process.env.REGISTRY_STORAGE_DIR;
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}
