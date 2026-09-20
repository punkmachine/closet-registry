# closet-registry

Self-hosted HTTP-реестр плагинов для [`closet-cli`](https://github.com/punkmachine/closet-cli).

```bash
git clone https://github.com/punkmachine/closet-registry.git
cd closet-registry
./up.sh
```

Открой http://127.0.0.1:3001 — это админка. На сервер с доменом: в `.env` укажи `DOMAIN` и `ACME_EMAIL`, затем `./up.sh --tls`. Подробности в [DEPLOY.md](DEPLOY.md).

`closet-cli.json`:

```json
{
  "registry": {
    "url": "http://127.0.0.1:3000",
    "token": "<ADMIN_TOKEN из .env>"
  }
}
```

## Разработка

Node 22+, pnpm 11, Postgres на localhost.

```bash
pnpm install
cp .env.example .env
pnpm migration:run
pnpm dev
```

`GET /health` без токена. Все `/v1/*` — `Authorization: Bearer <ADMIN_TOKEN>`.

## API

- `GET /health`
- `GET /v1/plugins`
- `GET /v1/plugins/:slug/versions`
- `GET /v1/plugins/:slug/:version` — bundle, `version` может быть `latest`
- `POST /v1/stats/installs`
- `POST/PUT/DELETE /v1/admin/plugins...` — `multipart/form-data`
