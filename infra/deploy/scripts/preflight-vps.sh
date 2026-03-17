#!/usr/bin/env bash
set -euo pipefail

check_cmd() {
  local cmd="$1"
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[ok] $cmd"
  else
    echo "[missing] $cmd"
  fi
}

echo "Validando dependencias basicas da VPS..."
check_cmd node
check_cmd npm
check_cmd pm2
check_cmd nginx
check_cmd certbot
check_cmd psql
check_cmd curl
check_cmd jq

echo
echo "Versoes encontradas:"
(node -v 2>/dev/null || true)
(npm -v 2>/dev/null || true)
(pm2 -v 2>/dev/null || true)
(nginx -v 2>&1 || true)
(psql --version 2>/dev/null || true)

if ss -ltn '( sport = :3000 )' | grep -q LISTEN; then
  echo "[ok] Porta 3000 em uso"
else
  echo "[info] Porta 3000 livre"
fi
