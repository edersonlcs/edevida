# Migracao para Hostinger Node.js (futuro)

Objetivo: mover da VPS atual para hospedagem Node gerenciada da Hostinger com minimo ajuste.

## 1. Estrutura esperada

- Aplicacao alvo: `apps/api`
- Comando de start: `npm run start`
- Versao Node: 20+ (preferencia 22 quando disponivel)

## 2. Variaveis de ambiente (painel Hostinger)

Copiar do `.env` atual (sem expor em Git):

- `NODE_ENV=production`
- `PORT` (usar a porta exigida pela Hostinger, se aplicavel)
- `APP_HOST=0.0.0.0`
- `APP_BASE_URL=https://edevida.edexterno.com.br`
- `APP_TIMEZONE=America/Sao_Paulo`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL_TEXT`
- `OPENAI_MODEL_VISION`
- `OPENAI_MODEL_TRANSCRIBE`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

## 3. Build/Deploy

1. Subir codigo do repositorio `edersonlcs/edevida`.
2. Executar `npm ci` em `apps/api`.
3. Configurar comando de start para `npm run start`.
4. Garantir que a rota `/health` responde 200.

## 4. Dominio e Telegram

1. Manter DNS de `edevida.edexterno.com.br` apontando para novo host.
2. Atualizar webhook Telegram:

```bash
./infra/scripts/telegram-webhook.sh edevida.edexterno.com.br
```

3. Validar webhook:

```bash
curl -sS https://edevida.edexterno.com.br/api/telegram/webhook-info | jq .
```

## 5. Checklist de corte

- [ ] API responde `/health` em HTTPS
- [ ] `/painel` abre e registra dados
- [ ] Bot Telegram recebe texto/foto/audio
- [ ] Dados gravam no Supabase
- [ ] Relatorio diario gera com sucesso
- [ ] PM2 nao necessario (host gerenciado)

## 6. Rollback rapido

Se houver falha, retornar DNS para VPS antiga e reexecutar webhook apontando para a VPS.
