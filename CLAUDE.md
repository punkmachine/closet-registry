# CLAUDE.md

## Обзор проекта

`closet-registry` — self-hosted HTTP-реестр плагинов (Fastify + Postgres + TypeORM)
для CLI-инструмента `closet-cli` (лежит рядом, в `../closet-cli`). Плагин — это
именованный (`slug`) набор версионированных файлов, сгруппированных по компонентам
(`mcp`/`rules`/`hooks`/`agents`/`commands`/`skills`/`scripts`) и опционально по ИИ
(`codex`/`claude-code`, либо общий файл). Есть bundle-чтение версии плагина,
листинг метаданных всех плагинов (`GET /v1/plugins`, под `closet-cli list --all`,
добавлен 2026-09-13), admin write-эндпоинты за Bearer-токеном и эндпоинт
статистики установок.

`../closet-cli/src/registry/http-client.ts` (`HttpRegistryClient`) — уже существующий,
но написанный под **старый** контракт (`/v1/items`, без Bearer) и с новым API этого
репозитория (`/v1/plugins/:slug/:version`, все `/v1/*` за токеном) не совпадает —
интеграция ещё не доведена до конца.

## Команды разработки

Пакетный менеджер — **pnpm**, не npm/yarn.

```bash
pnpm install              # установка зависимостей
pnpm dev                  # tsx watch src/server.ts
pnpm build                # tsc -p tsconfig.json -> dist/
pnpm start                # node dist/server.js (после build)
pnpm typecheck            # tsc --noEmit
pnpm migration:run        # tsx src/db/run-migrations.ts (накатить миграции TypeORM)
pnpm migration:revert     # tsx src/db/revert-migration.ts (откатить последнюю)
pnpm test                 # vitest run (тестового набора пока нет)
```

`.env` (не коммитится, шаблон — `.env.example`) обязателен для `dev`/`start`/
`migration:run`/`migration:revert`: `DATABASE_URL`, `ADMIN_TOKEN`, `PORT`.

Миграции — не через `typeorm` CLI, а через собственные скрипты
(`src/db/run-migrations.ts`/`revert-migration.ts`), которые сами инициализируют
`AppDataSource` и вызывают `runMigrations()`/`undoLastMigration()`. Новый файл
миграции нужно руками добавить и в `src/db/migrations/`, и в массив `migrations`
в `src/db/data-source.ts` — авто-обнаружения по маске пути нет.

## Архитектура

- `src/server.ts` — точка входа: `dotenv/config`, `buildApp()` на `0.0.0.0:$PORT`.
- `src/app.ts` — сборка Fastify-приложения: zod validator/serializer compiler
  (`@fastify/type-provider-zod`), единый `setErrorHandler` (различает zod
  validation error / response serialization error / прочее), регистрация плагинов
  и роутов.
- `src/db/entities/` — TypeORM-сущности: `Plugin` 1—N `PluginVersion` 1—N
  `PluginFile`; `PluginDependency` — self-referencing M2M на `Plugin`
  (`plugin`/`dependsOn`); `InstallEvent` — факт установки конкретной версии.
  `Plugin`/`PluginVersion` — soft delete (`deleted`/`deletedAt`), `PluginFile`
  — нет (версия при перезаписи просто теряет старые файлы, см. ниже).
- `src/db/naming-strategy.ts` — `SnakeNamingStrategy` конвертирует camelCase-поля
  entity в snake_case-колонки автоматически (`pluginId` → `plugin_id`), поэтому
  колонкам не нужен явный `name`.
- `src/db/data-source.ts` — `AppDataSource`, читает `DATABASE_URL` из env.
  `id`/foreign-key-колонки — `bigint` в БД, но типизированы `string` в entity
  (`declare id: string`) — стандартный для TypeORM способ не терять точность
  за пределами `Number.MAX_SAFE_INTEGER`; не менять на `number`.
- `src/registry/plugins-repository.ts` — вся работа с `Plugin`/`PluginVersion`/
  `PluginFile`/`PluginDependency` через `DataSource`/`EntityManager`. Публикация/
  апдейт версии — в одной transaction (`dataSource.transaction`). "Последняя
  версия" (`findLatestActiveVersion`) считается через `semver.gt()` reduction по
  всем активным версиям, не через `created_at`/лексикографию.
  `findAllActivePluginsWithLatestVersion` (добавлена 2026-09-13, под
  `GET /v1/plugins`) делает то же для ВСЕХ плагинов сразу одним запросом
  (`relations: { versions: true }` — JOIN, не N+1); плагины без ни одной
  активной версии (все soft-deleted) в результат не попадают.
- `src/registry/file-store.ts` — контент файлов хранится на диске
  (`registry/plugins/<slug>/<version>/<component>/[<ai>/]<relativePath>`), в БД —
  только метаданные (`storagePath`/`sha256`/`sizeBytes`/`rootPath`/`merge`/
  `mergeKeyPath`/`template`). `resolveSafePath()` — защита от path traversal
  (абсолютные пути, `..`, Windows drive letters вида `C:`, null-байты — всё
  `PathTraversalError` → роуты ловят её и отвечают `400`, не `500`).
- `src/plugins/` — `fastify-plugin`-обёрнутые (`fp()`) плагины: `postgres.ts`
  (декорирует `fastify.pg: Pool`, сырой `pg`), `typeorm.ts` (декорирует
  `fastify.orm: DataSource`, инициализирует `AppDataSource`), `admin-auth.ts`
  (Bearer-токен, `timingSafeEqual`), `multipart.ts` (`@fastify/multipart`,
  10MB/файл, до 200 файлов), `rate-limit.ts` (`@fastify/rate-limit` с
  `global: false`).
- `src/routes/` — `health.ts` (без префикса, без авторизации), `plugins.ts` +
  `stats.ts` (префикс `/v1`), `admin-plugins.ts` (вложенный префикс
  `/v1/admin`, `multipart.ts` только здесь).

### Два подключения к Postgres — это не ошибка

`postgres.ts` (сырой `pg.Pool`, `fastify.pg`) и `typeorm.ts` (`fastify.orm`)
регистрируются оба. `fastify.pg` используется **только** в `/health` для
дешёвого `SELECT 1`, не зависящего от жизненного цикла `AppDataSource`; вся
остальная работа с БД — через `fastify.orm`. Не удалять и не сливать одно в
другое не разобравшись.

### Важно: почему `admin-auth.ts` обёрнут в `fp()`

В `app.ts` внутри одного `{prefix: "/v1"}` колбэка последовательно вызываются
`v1Scope.register(adminAuthPlugin)`, затем `v1Scope.register(statsRoutes)`,
`v1Scope.register(pluginsRoutes)` и вложенный `v1Scope.register(..., {prefix:
"/admin"})`. Без `fp()` каждый `.register()` создаёт свой изолированный
дочерний encapsulation-контекст — хук `onRequest`, добавленный внутри
`admin-auth`, в этом случае НЕ долетел бы до соседних роутов, зарегистрированных
на том же `v1Scope` (это реальный баг из первой реализации: часть `/v1/*`
принимала запросы вообще без токена). `fp()` поднимает эффект плагина ровно на
один уровень вверх — до `v1Scope`, откуда его наследуют все дочерние
`register()`-вызовы. Модель авторизации именно такая: **токен обязателен на
всех `/v1/*`, включая чтение**, не только на `/v1/admin` — `GET /health`
единственный публичный эндпоинт. Если будешь трогать регистрацию роутов — не
убирай `fp()` и не меняй порядок регистрации `adminAuthPlugin`.

### `PUT /v1/admin/plugins/:slug/:version` — это full replace, не patch

`upsertPluginVersion` каждый раз удаляет и пересоздаёт все `PluginDependency`
плагина и все `PluginFile` версии (`replacePluginDependencies`/
`replaceVersionFiles`), а `writeVersionFiles` перед записью грохает всю
директорию версии на диске (`fs.rm(versionDir, { recursive: true, force: true
})`). Тело запроса должно содержать полный набор файлов и зависимостей версии,
а не только изменившиеся.

### Грабли TypeORM в `plugins-repository.ts`

- `versionRepo.findOne({ where: { version, plugin: { id: plugin.id } } })`, а
  не `{ plugin }` целиком — иначе TypeORM фильтрует по всем колонкам связанной
  сущности (включая `deletedAt: null`) и падает без явного `IsNull()`.
- Удаление файлов версии — через `fileRepo.createQueryBuilder().delete().where("version_id = :versionId", ...)`,
  а не `delete({ version })` — так проще, чем разбираться с неоднозначностью
  `FindOptionsWhere` на relation-объекте при удалении.
- Публикация версии "воскрешает" ранее soft-deleted плагин под тем же `slug`
  (`upsertPluginRecord` сбрасывает `deleted`/`deletedAt`) — иначе slug навсегда
  становится непереиспользуемым.

### `noUncheckedIndexedAccess`

Включён в `tsconfig.json`. Прямая индексация массива/объекта типизируется как
`T | undefined` — паттерн в репозитории: проверка `if (!row)` / деструктуризация
с дефолтом, не гасить через `!`.

### Декораторы и ESM-импорты

`experimentalDecorators`/`emitDecoratorMetadata`/`useDefineForClassFields: false`
в `tsconfig.json` нужны TypeORM-декораторам на entities — не трогать при
рефакторинге компилятора. `reflect-metadata` импортируется первой строкой в
`src/db/data-source.ts`, до любых импортов entity-классов.

`"type": "module"` + `moduleResolution: "NodeNext"` — все относительные
импорты в `.ts`-файлах пишутся с `.js` на конце (`from "./types.js"`),
несмотря на то что исходники `.ts`. Забытое `.js` — рабочая ошибка в рантайме,
не только в тайпчеке.

## Безопасность / известные компромиссы

- `ADMIN_TOKEN` в `.env` — одно значение на весь инстанс, защищает **все**
  `/v1/*` (не только write). Сравнение — `timingSafeEqual`, но при утечке
  токена единственный способ отозвать доступ — сгенерировать новый и
  перезапустить сервер.
- CORS открыт (`origin: true`).
- Rate limit глобально выключен (`global: false`) и включается точечно через
  `config.rateLimit` на роуте: `POST /v1/stats/installs` — 20/10 минут,
  write-эндпоинты `/v1/admin/plugins*` — 300/минуту. `GET /v1/plugins/:slug/:version`
  и `GET /health` лимитов не имеют.
