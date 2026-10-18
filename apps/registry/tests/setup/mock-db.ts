import { vi } from "vitest";

vi.mock("../../src/registry/plugins-repository.js", async () => {
  const { createRepositoryModule } = await import("../helpers/fake-db.js");
  return createRepositoryModule();
});

vi.mock("../../src/db/stats-repository.js", async () => {
  const { createStatsRepositoryModule } = await import("../helpers/fake-db.js");
  return createStatsRepositoryModule();
});

vi.mock("../../src/auth/repository/sessions.js", async (importOriginal) => {
  const { fakeAuth } = await import("../helpers/fake-auth.js");
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    findSessionByTokenHash: (_dataSource: unknown, tokenHash: string) =>
      Promise.resolve(fakeAuth.findSession(tokenHash)),
    touchSession: () => Promise.resolve(false),
  };
});

vi.mock("../../src/auth/repository/api-tokens.js", async (importOriginal) => {
  const { fakeAuth } = await import("../helpers/fake-auth.js");
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    findActiveApiTokenByHash: (_dataSource: unknown, tokenHash: string) =>
      Promise.resolve(fakeAuth.findActiveApiToken(tokenHash)),
    touchApiToken: () => Promise.resolve(false),
  };
});

vi.mock("../../src/auth/repository/audit.js", async (importOriginal) => {
  const { fakeAuth } = await import("../helpers/fake-auth.js");
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    writeAuditEntry: (_dataSource: unknown, entry: Parameters<typeof fakeAuth.recordAuditEntry>[0]) => {
      fakeAuth.recordAuditEntry(entry);
      return Promise.resolve();
    },
  };
});

vi.mock("../../src/plugins/postgres.js", async () => {
  const { stubPostgresPlugin } = await import("../helpers/stub-plugins.js");
  return { default: stubPostgresPlugin };
});

vi.mock("../../src/plugins/typeorm.js", async () => {
  const { stubTypeormPlugin } = await import("../helpers/stub-plugins.js");
  return { default: stubTypeormPlugin };
});
