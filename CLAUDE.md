# CLAUDE.md

## Обзор проекта

`closet-registry` — self-hosted HTTP-реестр плагинов (Fastify + Postgres + TypeORM)
для CLI-инструмента `closet-cli` (лежит рядом, в `../closet-cli`). Плагин — это
именованный (`slug`) набор версионированных файлов, сгруппированных по компонентам
(`mcp`/`rules`/`hooks`/`agents`/`commands`/`skills`/`scripts`) и опционально по ИИ
(`codex`/`claude-code`, либо общий файл). Файл бывает `raw` (готовый, отдаётся как есть) или `spec`
(нейтральный источник агента, который при выдаче bundle разворачивается в файлы под каждый ИИ). Есть bundle-чтение версии плагина,
листинг метаданных всех плагинов (`GET /v1/plugins`, под `closet-cli list --all`,
добавлен 2026-09-13), admin write-эндпоинты за Bearer-токеном и эндпоинт
статистики установок.

`../closet-cli/src/registry/http-client.ts` (`HttpRegistryClient`) — уже существующий,
но написанный под **старый** контракт (`/v1/items`, без Bearer) и с новым API этого
репозитория (`/v1/plugins/:slug/:version`, все `/v1/*` за токеном) не совпадает —
интеграция ещё не доведена до конца.

## Пакеты (`packages/*`)

- `@closet/contract` — единственный источник контракта API: zod-схемы, `z.infer`-типы,
  `PLUGIN_COMPONENTS`/`PLUGIN_FILE_AI_VALUES`/`PLUGIN_FILE_FORMATS`, `harnesses.ts` (`HARNESS_IDS`,
  матрица поддержки `HARNESS_SUPPORT` `component × harness`, `SPEC_COMPONENTS`), лимиты (`MAX_FILE_SIZE_BYTES`,
  `MAX_FILES_PER_VERSION`), `slugSchema`/`semverSchema` (charset slug закрывает path
  traversal). Зависимости только `zod` и `semver`. **Собирается `tsc` в `dist/`**
  (`pnpm build:packages`): `exports` → `dist` (types/default) и условие `development` →
  `src` (для `tsx --conditions=development`). Исходники не отдаются как `exports`
  напрямую, потому что registry собирается с `rootDir: src` и запускается `node dist/server.js`.
  `typecheck`/`build`/`dev` в корне сами вызывают `build:packages` первым шагом.
- `@closet/harness-render` — чистые функции без IO (зависимости `@closet/contract`, `yaml`), собирается `tsc` в
  `dist/` так же, как contract: `parseSpec` (Markdown + frontmatter → `AgentSpec`), `renderSpec(spec, harness)`
  (→ `<name>.md` для `claude-code`, `<name>.toml` для `codex`), `SpecDraft`/`draftToText`/`textToDraft`/`importAgentMarkdown`
  (поля формы админки ↔ текст spec). Ошибки — `SpecError` с текстом для пользователя. Используется и сервером (bundle,
  валидация при публикации), и админкой (превью).
- `@closet/config` — общие tsconfig (`tsconfig/base|node|vue.json`). `apps/admin-panel/tsconfig.json`
  остаётся ссылкой на сгенерированные Nuxt'ом конфиги.
- `@closet/ui` — Vue-компоненты (`ComponentBadge`, `PluginCard`, `ConfirmDialog`,
  `FileBrowser`) + `tokens.css` + `utilities.css`; исходники без сборки, Nuxt транспилирует
  (`build.transpile`). Глобальных `.css` всего три: `tokens.css`, `utilities.css` (пакет ui) и
  `main.css` (reset/типографика админки); всё остальное — `<style scoped>` в самих компонентах,
  общие куски (`.btn`, `.badge`, `.panel`…) намеренно продублированы по файлам. `PluginForm` остался в админке (завязан на `utils/plugin-files.ts`
  и Nuxt). Ссылку `PluginCard` принимает пропом `as` (например `NuxtLink`).

## Команды разработки

Пакетный менеджер — **pnpm**, не npm/yarn.

```bash
pnpm install              # установка зависимостей
pnpm dev                  # tsx watch src/server.ts
pnpm build                # tsc -p tsconfig.build.json -> dist/ (только src/; tsconfig.json включает ещё и tests/ для typecheck/ESLint)
pnpm start                # node dist/server.js (после build)
pnpm typecheck            # tsc --noEmit
pnpm migration:run        # tsx src/db/run-migrations.ts (накатить миграции TypeORM)
pnpm migration:revert     # tsx src/db/revert-migration.ts (откатить последнюю)
pnpm test                 # vitest run (проекты: contract, harness-render, registry-unit, registry-api, admin-unit, codemods)
```

`.env` (не коммитится, шаблон — `.env.example`) обязателен для `dev`/`start`/
`migration:run`/`migration:revert`: `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PORT` (опционально `TRUST_PROXY=true` за прокси).

Миграции — не через `typeorm` CLI, а через собственные скрипты
(`src/db/run-migrations.ts`/`revert-migration.ts`), которые сами инициализируют
`AppDataSource` и вызывают `runMigrations()`/`undoLastMigration()`. Новый файл
миграции нужно руками добавить и в `src/db/migrations/`, и в массив `migrations`
в `src/db/data-source.ts` — авто-обнаружения по маске пути нет.

## Форматирование и линтинг

- **Форматтер — Biome** (`biome.json` в корне, `lineWidth: 120`, линтер Biome выключен);
  `pnpm format` / `pnpm format:check`. Prettier в зависимостях быть не должен.
- **Линтер — ESLint 10 + typescript-eslint (`strictTypeChecked`, `projectService`)** на весь
  монорепо, конфиг — `eslint.config.ts`; `pnpm lint` / `pnpm lint:fix`. Проверяются только `*.ts`:
  `.vue` не линтится (нужен `vue-eslint-parser`). `eslint-plugin-n` и `eslint-plugin-security` —
  только `apps/registry`; `eslint-plugin-import` установлен, но не подключён.
  Исключения оформляются `eslint-disable-next-line ... -- причина`.
- **TypeScript везде 5.9** (одна запись `typescript` в `catalog` в `pnpm-workspace.yaml`):
  `typescript-eslint` не работает с TS 7 (нет старого JS API), поэтому registry понижен с 7.0.
  Не возвращать TS 7, пока typescript-eslint его не поддержит.
- Git-хуки (`simple-git-hooks` + `nano-staged`): pre-commit гоняет `biome check --write` и
  `eslint --fix` по staged-файлам, pre-push — `format:check`, `lint`, `typecheck`, `test`.

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
  `fastify.orm: DataSource`, инициализирует `AppDataSource`), `auth.ts`
  (Bearer: сессия/API-токен по sha256-хешу, роль и блокировки), `multipart.ts` (`@fastify/multipart`,
  10MB/файл, до 200 файлов), `rate-limit.ts` (`@fastify/rate-limit` с
  `global: false`).
- `src/routes/` — `health.ts` (без префикса, без авторизации), `plugins.ts` +
  `stats.ts` (префикс `/v1`), `admin-plugins.ts` (вложенный префикс
  `/v1/admin`, `multipart.ts` только здесь).

### Spec-файлы: один источник → файлы под каждый ИИ

- `plugin_files.format` (`raw` по умолчанию | `spec`) и `plugin_files.targets` (`text[]`, только у spec); миграция
  `AddPluginFileSpecFormat`. Spec — только `component: agents`, `ai: null`, без `merge`/`rootPath`/`template`, с непустыми
  уникальными `targets`, которые поддерживает `HARNESS_SUPPORT` (проверяет `pluginFileInputSchema`). Содержимое на диске
  лежит как загружено (Markdown + frontmatter); `targets` из метаданных приоритетнее `targets` во frontmatter.
- Публикация/PUT: `assertSpecFilesRenderable` (`services/publish-plugin.service.ts`) пробует развернуть каждый spec и
  отвечает `400 Invalid spec …` при ошибке, а также если два spec дают один и тот же файл (иначе падал бы `500` при чтении bundle).
- `GET /v1/plugins/:slug/:version` (`services/read-bundle.service.ts`, `expandBundleFiles`) разворачивает spec в обычные
  файлы (`ai` = цель, `sha256`/`sizeBytes` считаются по сгенерированному). Если среди `raw`-файлов есть файл с тем же
  компонентом/`ai`/путём, побеждает `raw` (override), сгенерированный пропускается. В bundle поле `format` не отдаётся:
  closet-cli видит только обычные файлы.
- `GET /v1/admin/plugins/:slug/:version/source` (`services/read-source.service.ts`, право `plugins:write`) отдаёт версию
  «как хранится»: spec не разворачивается, у файлов есть `format`/`targets`. Нужен форме редактирования в админке:
  bundle отдал бы уже готовые файлы, и сохранение превратило бы spec в набор raw-файлов.

### Админка: универсальный агент в `PluginForm`

`FormFile` (`apps/admin-panel/app/utils/plugin-files.ts`) кроме `raw` умеет `format: "spec"` с `targets` и `draft`
(`SpecDraft`: имя, описание, тело, YAML-блоки Claude/Codex). Путь spec-файла выводится из имени (`<name>.md`,
`fileRelativePath`), содержимое собирается `draftToText` при отправке (`buildFormData`); `validateForm` ловит ошибки до
запроса. Превью на каждую цель — `previewSpec` (рендер на клиенте через `@closet/harness-render`). «Заменить на свой файл» —
`overrideFileFor` (raw-файл под ИИ с содержимым рендера). Обычный файл агента импортируется кнопкой
(`importAsSpecFile`). Страница редактирования читает `/api/plugins/:slug/:version/source`, а не bundle. Если исходник spec не
разобрался, строка показывается как текстовый файл без структурной формы.

### Два подключения к Postgres — это не ошибка

`postgres.ts` (сырой `pg.Pool`, `fastify.pg`) и `typeorm.ts` (`fastify.orm`)
регистрируются оба. `fastify.pg` используется **только** в `/health` для
дешёвого `SELECT 1`, не зависящего от жизненного цикла `AppDataSource`; вся
остальная работа с БД — через `fastify.orm`. Не удалять и не сливать одно в
другое не разобравшись.

### Важно: почему `plugins/auth.ts` обёрнут в `fp()`

В `app.ts` внутри одного `{prefix: "/v1"}` колбэка последовательно вызываются
`v1Scope.register(authPlugin)`, затем `v1Scope.register(statsRoutes)`,
`v1Scope.register(pluginsRoutes)` и вложенный `v1Scope.register(..., {prefix:
"/admin"})`. Без `fp()` каждый `.register()` создаёт свой изолированный
дочерний encapsulation-контекст — хук `onRequest`, добавленный внутри
`auth`, в этом случае НЕ долетел бы до соседних роутов, зарегистрированных
на том же `v1Scope` (это реальный баг из первой реализации: часть `/v1/*`
принимала запросы вообще без токена). `fp()` поднимает эффект плагина ровно на
один уровень вверх — до `v1Scope`, откуда его наследуют все дочерние
`register()`-вызовы. Модель авторизации именно такая: **токен обязателен на
всех `/v1/*`, включая чтение**, не только на `/v1/admin` — `GET /health`
единственный публичный эндпоинт. Если будешь трогать регистрацию роутов — не
убирай `fp()` и не меняй порядок регистрации `authPlugin`.

### `PUT /v1/admin/plugins/:slug/:version` — это full replace, не patch

`updatePluginVersion` каждый раз удаляет и пересоздаёт все `PluginDependency`
плагина и все `PluginFile` версии (`replacePluginDependencies`/
`replaceVersionFiles`), а `writeVersionFiles` перед записью грохает всю
директорию версии на диске (`fs.rm(versionDir, { recursive: true, force: true
})`). Тело запроса должно содержать полный набор файлов и зависимостей версии,
а не только изменившиеся. PUT — не upsert: на несуществующий плагин, несуществующую или
soft-deleted версию отвечает `404 Plugin <slug>@<version> not found` и ничего не создаёт
(в т.ч. не воскрешает); создание версий и воскрешение slug — только `POST`. Проверка
существования идёт до `writeVersionFiles`, чтобы не снести файлы чужой версии.

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

- Авторизация — пользователи с ролями `admin`/`developer`/`guest` (`ROLE_PERMISSIONS` в
  контракте). Bearer на **всех** `/v1/*`, кроме `POST /v1/auth/login`: сессия админки
  (`cls_…`, 7 дней скользящих) или персональный API-токен (`clt_…`, один активный на
  юзера). В БД только sha256-хеши. Роль берётся из пользователя на каждом запросе, поэтому
  блокировка и смена роли действуют сразу. Префикс `/v1/admin` не означает «только admin»:
  write плагинов доступен developer, users/audit — только admin.
- `ADMIN_USERNAME`/`ADMIN_PASSWORD` нужны лишь для bootstrap первого admin
  (`auth/bootstrap-admin.ts`, из `server.ts`); существующего admin не перезаписывают.
  `up.sh` генерирует пароль со спецсимволом, чтобы он проходил `passwordSchema`.
- `TRUST_PROXY=true` (compose выставляет у `api`) включает `trustProxy` Fastify: без него за
  Caddy/BFF rate limit логина и аудит видят один IP. Включать только если API недоступен
  напрямую из интернета. Caddy больше не делает Basic Auth — вход через `/login` админки.
- CORS открыт (`origin: true`).
- Rate limit глобально выключен (`global: false`) и включается точечно через
  `config.rateLimit` на роуте: `POST /v1/stats/installs` — 20/10 минут,
  write-эндпоинты `/v1/admin/plugins*` — 300/минуту. `GET /v1/plugins/:slug/:version`
  и `GET /health` лимитов не имеют.
