# Запуск

Нужен [Docker](https://docs.docker.com/get-docker/).

```bash
git clone https://github.com/punkmachine/closet-registry.git
cd closet-registry
./up.sh
```

Админка: http://127.0.0.1:3001  
Скрипт сам создаст `.env` и секреты. Вход: логин `ADMIN_USERNAME` (по умолчанию `admin`), пароль — `ADMIN_PASSWORD` из `.env`; после первого входа смени его в «Аккаунт». Токен для `closet-cli` — «Аккаунт → Токен» (показывается один раз).

Остановить: `docker compose down` (данные останутся).

## Свой сервер и домен

1. A-запись `registry.example.com` → IP сервера (порты 80 и 443 открыты).
2. В `.env` пропиши `DOMAIN=registry.example.com` и `ACME_EMAIL=you@example.com`.
3. `./up.sh --tls`

Админка: `https://registry.example.com/` (своя страница входа, Basic Auth нет).  
`closet-cli` смотрит на тот же домен, токен — персональный `clt_…` из админки.

## Уже есть nginx / caddy

`./up.sh`, дальше проксируй:

- `/v1` и `/health` → `127.0.0.1:3000` (без пароля браузера)
- всё остальное → `127.0.0.1:3001`

У `api` должен быть `TRUST_PROXY=true`, а прокси — передавать `X-Forwarded-For`/`X-Forwarded-Proto`: иначе rate limit логина видит один IP на всех, а cookie админки не получит `secure`. Порт API при этом нельзя открывать в интернет напрямую (заголовок подделывается).

## Если не встало

| Симптом | Что сделать |
| --- | --- |
| `нужен Docker` | Поставить Docker Desktop и дождаться кита в меню |
| `api` рестартится | В `.env` пустые или невалидные `ADMIN_USERNAME` / `ADMIN_PASSWORD` (пароль: от 9 символов и спецсимвол) — исправь или запусти `./up.sh` ещё раз |
| Забыл пароль admin | `ADMIN_PASSWORD` действует только пока в базе нет admin. Сбросить пароль может другой admin; единственного — только правкой БД |
| Браузер ругается на сертификат | DNS ещё не указывает на сервер, или забыли `--tls` |
| Обновление | `git pull && ./up.sh` |
