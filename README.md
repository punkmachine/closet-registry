# closet-registry

Self-hosted HTTP-реестр плагинов для [`closet-cli`](https://github.com/punkmachine/closet-cli).

```bash
git clone https://github.com/punkmachine/closet-registry.git
cd closet-registry
./up.sh
```

Открой http://127.0.0.1:3001 — это админка. Логин `admin`, пароль — `ADMIN_PASSWORD` из `.env`. Токен для `closet-cli` выпускается в «Аккаунт → Токен». На сервер с доменом: в `.env` укажи `DOMAIN` и `ACME_EMAIL`, затем `./up.sh --tls`. Подробности в [DEPLOY.md](DEPLOY.md).

`closet-cli.json`:

```json
{
  "registry": {
    "url": "http://127.0.0.1:3000",
    "token": "<персональный токен clt_… из админки>"
  }
}
```

## Roadmap

Планы развития — в [ROADMAP.md](ROADMAP.md).

## Разработка

Node 22+, pnpm 11, Postgres на localhost.

```bash
pnpm install
cp .env.example .env
pnpm migration:run
pnpm dev
```

`GET /health` без токена. Все `/v1/*` (кроме `POST /v1/auth/login`) — `Authorization: Bearer <токен>`: персональный `clt_…` для CLI или сессионный `cls_…` админки.
Роли: `guest` — чтение, `developer` — ещё создание и правка плагинов, `admin` — ещё удаление, пользователи и аудит.
Первый admin создаётся при старте API из `ADMIN_USERNAME` / `ADMIN_PASSWORD` (пароль: от 9 символов и спецсимвол).

## API

- `GET /health`
- `GET /v1/plugins`
- `GET /v1/plugins/:slug/versions`
- `GET /v1/plugins/:slug/:version` — bundle, `version` может быть `latest`
- `POST /v1/stats/installs`
- `POST/PUT/DELETE /v1/admin/plugins...` — `multipart/form-data`
- `POST /v1/auth/login`, `GET /v1/auth/me`, `POST /v1/auth/logout`, `POST /v1/auth/change-password`, `GET/POST/DELETE /v1/auth/token`
- `/v1/admin/users*`, `GET /v1/admin/audit` — только admin
