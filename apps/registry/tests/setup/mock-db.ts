/**
 * setupFiles проекта registry-api: подменяет слой данных ДО загрузки любого тестового файла.
 * vi.mock в setupFiles хойстится и действует на все импорты в тестах и приложении, поэтому
 * динамический `import("../../src/app.js")` в buildTestApp получает fake вместо Postgres/TypeORM.
 *
 * Подменяются: репозитории (plugins-repository, stats-repository) и плагины postgres/typeorm.
 * Не подменяются: роуты, валидация, file-store, admin-auth, rate-limit, multipart.
 * Пути относительно этого файла; они резолвятся в те же модули, что импортирует src/app.ts.
 */
import { vi } from "vitest";

vi.mock("../../src/registry/plugins-repository.js", async () => {
  const { createRepositoryModule } = await import("../helpers/fake-db.js");
  return createRepositoryModule();
});

vi.mock("../../src/db/stats-repository.js", async () => {
  const { createStatsRepositoryModule } = await import("../helpers/fake-db.js");
  return createStatsRepositoryModule();
});

vi.mock("../../src/plugins/postgres.js", async () => {
  const { stubPostgresPlugin } = await import("../helpers/stub-plugins.js");
  return { default: stubPostgresPlugin };
});

vi.mock("../../src/plugins/typeorm.js", async () => {
  const { stubTypeormPlugin } = await import("../helpers/stub-plugins.js");
  return { default: stubTypeormPlugin };
});
