#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

echo "[1/5] Instalando dependencias da API"
cd apps/api
npm ci
cd "$ROOT_DIR"

echo "[2/5] Aplicando/recarregando processo PM2"
pm2 startOrReload infra/deploy/pm2/ecosystem.config.cjs --update-env
pm2 save

echo "[3/5] Health check local"
curl -fsS http://127.0.0.1:3000/health | jq .

echo "[4/5] Status PM2"
pm2 status

echo "[5/5] Deploy finalizado"
