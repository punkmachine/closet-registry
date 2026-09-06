# closet-ai-registry — инструкции для Claude Code

Этот файл — точка входа для Claude Code при работе в этом репозитории.

## Обзор проекта

`closet-ai-registry` — HTTP-реестр (Fastify + Postgres) поверх каталога
переиспользуемых items (`rules`/`skills`/`commands`/`agents`/`hooks`/`mcp`/
`statusline`) для CLI-инструмента `closet-ai` (лежит рядом, в `../closet-ai`).
Публичное read-only API + admin write-эндпоинты за Bearer-токеном +
эндпоинт статистики установок.

Это будущая замена `FixtureRegistryClient` (локальный `fixtures/index.json`)
в CLI на `HttpRegistryClient` — контракт данных (`ItemMetadata`,
`ItemFileContent`, флаги `rootPath`/`merge`/`template`) намеренно совпадает
с `../closet-ai/src/registry/types.ts`, см. `src/registry/types.ts`.

Как мануально всё прогнать (миграции, сервер, сидинг фикстур из CLI,
smoke-тест admin-эндпоинтов) — см. `test.md`.

## Команды разработки

Пакетный менеджер — **pnpm**, не npm/yarn.

```bash
pnpm install            # установка зависимостей
pnpm dev                # tsx watch src/server.ts
pnpm build               # tsc -> dist/
pnpm start                # node dist/server.js (после build)
pnpm typecheck          # tsc --noEmit
pnpm migrate up         # накатить миграции (node-pg-migrate, .env подхватывается сам)
pnpm migrate:create <имя> # создать новую миграцию
pnpm seed                # засеять items из ../closet-ai/fixtures через admin-API
pnpm test                  # vitest (тестового набора пока нет)
```

`.env` (не коммитится) обязателен для `dev`/`start`/`migrate`/`seed`:
`DATABASE_URL`, `ADMIN_TOKEN`, `PORT`. Шаблон — `.env.example`.

## Архитектура

- `src/server.ts` — точка входа, грузит `dotenv/config`, поднимает
  `buildApp()` на `0.0.0.0:$PORT`.
- `src/app.ts` — сборка Fastify-приложения: zod validator/serializer
  compiler из `@fastify/type-provider-zod`, единый `setErrorHandler`
  (различает zod validation error / response serialization error / прочее),
  регистрация плагинов и роутов.
- `src/registry/types.ts` + `schemas.ts` — контракт данных: plain TS-типы
  зеркалятся zod-схемами (`ItemMetadata`, `ItemCreatePayload`, ...).
  `ITEM_TYPES` — `as const satisfies readonly ItemType[]` кортеж, нужен
  именно в этой форме для `z.enum()`.
- `src/registry/items-repository.ts` — вся работа с таблицей `items`
  через `pg.Pool` (передаётся первым аргументом в каждую функцию, а не
  через замыкание/DI). "Последняя версия" считается через `semver.gt()`
  reduction (`pickLatest`), не через `created_at`/лексикографию — версии
  не обязаны приходить по возрастанию.
- `src/registry/file-store.ts` — контент файлов item'ов хранится на диске
  (`registry/items/<type>/<name>/<version>/...`), в БД — только метаданные
  файлов (`path`/`rootPath`/`merge`/`template`, без `content`).
  `resolveSafePath()` — защита от path traversal (абсолютные пути, `..`,
  Windows drive letters вида `C:`, null-байты — всё `PathTraversalError`
  → роуты ловят её и отвечают `400`, не `500`).
- `src/db/migrations/` — node-pg-migrate, TS-файлы, raw SQL внутри
  `pgm.sql(...)` (не билдер-DSL). **Любое изменение схемы БД — только через
  новую миграцию** (`pnpm migrate:create`), руками в Postgres не лезть.
- `src/plugins/` — три `fastify-plugin`-обёрнутых (`fp()`) плагина:
  `postgres.ts` (декорирует `fastify.pg: Pool`, закрывает пул на `onClose`),
  `rate-limit.ts` (`@fastify/rate-limit` с `global: false` — лимиты
  включаются только там, где явно указан `config.rateLimit` на роуте),
  `admin-auth.ts` (Bearer-токен, `timingSafeEqual` для сравнения).
- `src/routes/` — по модулю на группу роутов: `health.ts` (без префикса),
  `items.ts` + `stats.ts` (префикс `/v1`), `admin-items.ts` (префикс
  `/v1/admin`, требует `admin-auth`).

### Важно: почему `admin-auth.ts` обёрнут в `fp()`

В `app.ts` `adminAuthPlugin` и `adminItemsRoutes` регистрируются как два
отдельных `adminScope.register(...)` вызова внутри одного
`{prefix: "/v1/admin"}` колбэка. Без `fp()` каждый plain `.register()`
создаёт свой изолированный дочерний encapsulation-контекст — хук
`onRequest`, добавленный внутри `admin-auth`, в этом случае НЕ долетает до
соседнего `adminItemsRoutes` (это реальный баг, который был при первой
реализации: admin-эндпоинты принимали write-запросы вообще без токена).
`fp()` поднимает эффект плагина ровно на один уровень вверх — до
`adminScope`, который сам уже изолирован от `/health`/`/v1/items`/
`/v1/stats` внешним non-fp `app.register(callback, {prefix})`. Если будешь
трогать регистрацию admin-роутов — не убирай `fp()` здесь, это не
рефакторинг-мусор.

### `noUncheckedIndexedAccess`

Включён в `tsconfig.json`. Прямая индексация массива/объекта типизируется
как `T | undefined` — в репозитории (`items-repository.ts`, `stats.ts`)
это уже обработано через проверки `if (!row)` / деструктуризацию с
дефолтом, паттерн стоит повторять, а не гасить через `!`.

### `rootDir: "src"` и `scripts/`

`tsconfig.json` имеет `rootDir: "src"`, поэтому `scripts/seed-fixtures.ts`
сознательно не входит в `include` (добавление `"scripts/**/*.ts"` ломает
сборку с `TS6059`). Скрипт запускается напрямую через `tsx`
(`pnpm seed`), в `tsc --noEmit`/`tsc -p` не участвует.

### ESM-импорты

`"type": "module"` + `moduleResolution: "NodeNext"` — все относительные
импорты в `.ts`-файлах пишутся с `.js` на конце (`from "./types.js"`),
несмотря на то что исходники `.ts`. Забытое `.js` — рабочая ошибка в рантайме,
не только в тайпчеке.

## Безопасность / известные компромиссы

- `ADMIN_TOKEN` в `.env` — одно значение на весь admin-API (не per-user,
  без ротации/expiry). Сравнение — `timingSafeEqual`, но при утечке токена
  единственный способ отозвать доступ — сгенерировать новый и перезапустить
  сервер.
- CORS открыт (`origin: true`) — реестр публичный read-only по дизайну,
  ужесточать при появлении приватных данных.
- Docker/Traefik-конфиг (`docker/`) для деплоя за реверс-прокси с ACME
  проверялся только статически (`docker compose config`), живой
  `docker build`/`up` в этом окружении не прогонялся — см. `test.md`,
  если Docker недоступен локально.
