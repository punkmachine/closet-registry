import { vi } from "vitest";

vi.mock("../../src/registry/plugins-repository.js", async () => {
  const { createRepositoryModule } = await import("../helpers/fake-db.js");
  return createRepositoryModule();
});

vi.mock("../../src/db/stats-repository.js", async () => {
  const { createStatsRepositoryModule } = await import("../helpers/fake-db.js");
  return createStatsRepositoryModule();
});

// Константы и классы ошибок берём из оригинала, функции доступа к данным подменяем на fakeAuth.
vi.mock("../../src/auth/repository/users.js", async (importOriginal) => {
  const { createUsersRepositoryModule } = await import("../helpers/fake-auth.js");
  const original = await importOriginal<Parameters<typeof createUsersRepositoryModule>[0]>();
  return { ...original, ...createUsersRepositoryModule(original) };
});

vi.mock("../../src/auth/repository/sessions.js", async (importOriginal) => {
  const { createSessionsRepositoryModule } = await import("../helpers/fake-auth.js");
  const original = await importOriginal<Parameters<typeof createSessionsRepositoryModule>[0]>();
  return { ...original, ...createSessionsRepositoryModule(original) };
});

vi.mock("../../src/auth/repository/api-tokens.js", async (importOriginal) => {
  const { createApiTokensRepositoryModule } = await import("../helpers/fake-auth.js");
  return { ...(await importOriginal<Record<string, unknown>>()), ...createApiTokensRepositoryModule() };
});

vi.mock("../../src/auth/repository/audit.js", async (importOriginal) => {
  const { createAuditRepositoryModule } = await import("../helpers/fake-auth.js");
  return { ...(await importOriginal<Record<string, unknown>>()), ...createAuditRepositoryModule() };
});

vi.mock("../../src/plugins/postgres.js", async () => {
  const { stubPostgresPlugin } = await import("../helpers/stub-plugins.js");
  return { default: stubPostgresPlugin };
});

vi.mock("../../src/plugins/typeorm.js", async () => {
  const { stubTypeormPlugin } = await import("../helpers/stub-plugins.js");
  return { default: stubTypeormPlugin };
});
