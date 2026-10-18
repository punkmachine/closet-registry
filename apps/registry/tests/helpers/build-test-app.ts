import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { UserRole } from "@closet/contract";
import type { buildApp } from "../../src/app.js";
import { fakeAuth } from "./fake-auth.js";
import { fakeDb } from "./fake-db.js";

export interface BuildTestAppOptions {
  role?: UserRole;
}

export interface TestApp {
  app: Awaited<ReturnType<typeof buildApp>>;
  db: typeof fakeDb;
  auth: typeof fakeAuth;
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
  process.env.REGISTRY_STORAGE_DIR = storageDir;
  fakeDb.reset();
  fakeAuth.reset();
  const { token, authHeader } = fakeAuth.seedApiUser(options.role ?? "admin");

  const { buildApp } = await import("../../src/app.js");
  const app = await buildApp();
  await app.ready();

  return {
    app,
    db: fakeDb,
    auth: fakeAuth,
    storageDir,
    token,
    authHeader,
    async dispose() {
      await app.close();
      await rm(storageDir, { recursive: true, force: true });
    },
  };
}

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
