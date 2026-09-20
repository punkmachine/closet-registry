#!/bin/sh
# Caddy не умеет plaintext-пароль в Caddyfile — только bcrypt. Хеш считаем
# при старте, чтобы в .env лежал обычный пароль, а не $2a$14$...
# bcrypt сам состоит из `$`, а Caddyfile трактует `$FOO` как env, поэтому
# доллары в хеше удваиваются до записи конфига.
set -eu

if [ -z "${DOMAIN:-}" ]; then
  echo "error: DOMAIN is required with --profile tls (example: registry.example.com)" >&2
  exit 1
fi
if [ -z "${ACME_EMAIL:-}" ]; then
  echo "error: ACME_EMAIL is required with --profile tls (Let's Encrypt account email)" >&2
  exit 1
fi
if [ -z "${ADMIN_BASIC_PASSWORD:-}" ]; then
  echo "error: ADMIN_BASIC_PASSWORD is required with --profile tls (browser login for the admin UI)" >&2
  exit 1
fi

USER="${ADMIN_BASIC_USER:-admin}"
RAW_HASH="$(caddy hash-password --plaintext "$ADMIN_BASIC_PASSWORD")"
HASH_ESCAPED="$(printf '%s' "$RAW_HASH" | sed 's/\$/\$\$/g')"

# Шаблон смонтирован read-only; Caddy читает уже подставленный файл.
sed \
  -e "s/__ADMIN_BASIC_USER__/${USER}/g" \
  -e "s/__ADMIN_BASIC_HASH__/${HASH_ESCAPED}/g" \
  /etc/caddy/Caddyfile.tpl > /tmp/Caddyfile

exec caddy run --config /tmp/Caddyfile --adapter caddyfile
