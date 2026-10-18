#!/bin/sh
# Поднимает реестр и админку. Нужен только Docker.
#
#   ./up.sh          локально → http://127.0.0.1:3001
#   ./up.sh --tls    сервер с доменом → https://$DOMAIN/
set -eu
cd "$(dirname "$0")"

tls=0
[ "${1:-}" = "--tls" ] && tls=1

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "Нужен Docker с плагином Compose: https://docs.docker.com/get-docker/" >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker установлен, но не запущен. Открой Docker Desktop или выполни: colima start" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
fi

fill_empty() {
  key=$1
  value=$2
  current=$(grep "^${key}=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
  if [ -n "$current" ]; then
    return 0
  fi
  if grep -q "^${key}=" .env; then
    tmp=$(mktemp)
    awk -v k="$key" -v v="$value" 'index($0, k"=")==1 { print k"="v; next } { print }' .env >"$tmp"
    mv "$tmp" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

fill_empty ADMIN_USERNAME admin
# Пароль обязан проходить passwordSchema (>= 9 символов и спецсимвол). base64 спецсимвол не гарантирует
# (+ и / вычищаем как неудобные), поэтому дефис дописываем явно.
fill_empty ADMIN_PASSWORD "$(openssl rand -base64 24 | tr -d '\n=+/')-"
fill_empty POSTGRES_PASSWORD "$(openssl rand -base64 18 | tr -d '\n=')"

if [ "$tls" = 1 ]; then
  domain=$(grep "^DOMAIN=" .env | tail -1 | cut -d= -f2-)
  email=$(grep "^ACME_EMAIL=" .env | tail -1 | cut -d= -f2-)
  case "$domain" in
    "" | registry.example.com)
      echo "В .env укажи свой DOMAIN (A-запись уже должна смотреть на этот сервер)." >&2
      exit 1
      ;;
  esac
  if [ -z "$email" ]; then
    echo "В .env укажи ACME_EMAIL — почта для сертификата Let's Encrypt." >&2
    exit 1
  fi
fi

if [ "$tls" = 1 ]; then
  docker compose --profile tls up -d --build
else
  docker compose up -d --build
fi

admin_user=$(grep "^ADMIN_USERNAME=" .env | tail -1 | cut -d= -f2-)

echo
echo "Готово."
if [ "$tls" = 1 ]; then
  domain=$(grep "^DOMAIN=" .env | tail -1 | cut -d= -f2-)
  echo "  Админка:  https://${domain}/"
  echo "  API:      https://${domain}/v1"
  echo "  closet-cli.json:  url=https://${domain}"
else
  echo "  Админка:  http://127.0.0.1:3001"
  echo "  API:      http://127.0.0.1:3000/v1"
  echo "  closet-cli.json:  url=http://127.0.0.1:3000"
fi
echo "  Вход в админку: логин ${admin_user}, пароль — ADMIN_PASSWORD в .env (после первого входа смени его в Аккаунте)."
echo "  Токен для closet-cli: Админка → Аккаунт → Токен (показывается один раз)."
echo "  Секреты лежат в .env — файл не коммить."
