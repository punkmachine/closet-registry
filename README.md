# closet-registry

Self-hosted HTTP-реестр плагинов для `closet-cli` — CLI-инструмента, который устанавливает в проект пользователя файлы (`mcp`, `rules`, `hooks`, `agents`, `commands`, `skills`, `scripts`) под ИИ-агентов (`codex`, `claude-code`).

## Быстрый старт (разработка)

```bash
pnpm install
cp .env.example .env   # заполнить DATABASE_URL и ADMIN_TOKEN
pnpm migration:run
pnpm dev
```

`GET /health` — не требует токена. Все `/v1/*` эндпоинты (в том числе чтение) требуют `Authorization: Bearer <ADMIN_TOKEN>`.

## Деплой (Docker)

```bash
cd docker
docker compose --env-file ../.env up -d --build
```

`docker-compose.yml` поднимает три сервиса: `postgres`, `api` и `traefik` (реверс-прокси с автоматическим TLS через ACME/Let's Encrypt). Для `traefik` нужен реальный публичный домен, указанный в `DOMAIN`, и доступные извне порты 80/443 — без этого сервис не сможет выпустить сертификат. `postgres` и `api` можно поднять и без `traefik` для теста:

```bash
docker compose --env-file ../.env up -d --build postgres api
```

После первого запуска накатить миграции внутри контейнера:

```bash
docker compose exec api node dist/db/run-migrations.js
```

## API

- `GET /health` — без авторизации, проверка живости + доступности БД.
- `GET /v1/plugins/:slug/:version` — bundle-чтение: метаданные версии плагина и содержимое всех её файлов одним ответом (`version` может быть `"latest"`).
- `POST /v1/stats/installs` — фиксация факта установки плагина (`{ slug, version, cliVersion }`).
- `POST/PUT/DELETE /v1/admin/plugins...` — публикация, обновление и (мягкое) удаление версий/плагинов, `multipart/form-data`.