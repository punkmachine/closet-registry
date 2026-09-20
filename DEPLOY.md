# Запуск

Нужен [Docker](https://docs.docker.com/get-docker/).

```bash
git clone https://github.com/punkmachine/closet-registry.git
cd closet-registry
./up.sh
```

Админка: http://127.0.0.1:3001  
Скрипт сам создаст `.env` и секреты.

Остановить: `docker compose down` (данные останутся).

## Свой сервер и домен

1. A-запись `registry.example.com` → IP сервера (порты 80 и 443 открыты).
2. В `.env` пропиши `DOMAIN=registry.example.com` и `ACME_EMAIL=you@example.com`.
3. `./up.sh --tls`

Админка: `https://registry.example.com/` (логин/пароль — `ADMIN_BASIC_*` в `.env`).  
`closet-cli` смотрит на тот же домен, токен — `ADMIN_TOKEN` из `.env`.

## Уже есть nginx / caddy

`./up.sh`, дальше проксируй:

- `/v1` и `/health` → `127.0.0.1:3000` (без пароля браузера)
- всё остальное → `127.0.0.1:3001` (Basic Auth)

## Если не встало

| Симптом | Что сделать |
| --- | --- |
| `нужен Docker` | Поставить Docker Desktop и дождаться кита в меню |
| `api` рестартится | В `.env` пустой `ADMIN_TOKEN` — запусти `./up.sh` ещё раз |
| Браузер ругается на сертификат | DNS ещё не указывает на сервер, или забыли `--tls` |
| Обновление | `git pull && ./up.sh` |
