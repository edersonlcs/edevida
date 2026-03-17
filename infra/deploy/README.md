# Deploy EdeVida (VPS agora, hospedagem depois)

## Modo atual (VPS + localhost + Zero Trust)

1. API em localhost:
   - `cd apps/api`
   - `npm install`
   - `npm run start`
2. PM2 (opcional para processo continuo):
   - `pm2 start infra/deploy/pm2/ecosystem.config.cjs`
   - `pm2 save`
3. Nginx (opcional):
   - usar `infra/deploy/nginx/edevida.localhost.conf.example` como base.
4. Scripts utilitarios:
   - `./infra/deploy/scripts/preflight-vps.sh`
   - `./infra/deploy/scripts/deploy-api.sh`

## Modo migracao (hospedagem Node gerenciada)

1. Garantir variaveis de ambiente no painel da hospedagem.
2. Ajustar `APP_HOST=0.0.0.0` se o provedor exigir bind externo.
3. Comando de start esperado:
   - `npm run start` em `apps/api`.
4. Guia completo:
   - `infra/deploy/hostinger/README.md`

## Validacao rapida

- `curl http://127.0.0.1:3000/health`
- `curl http://127.0.0.1:3000/api/dashboard/overview?user_id=<UUID>`
- `curl http://127.0.0.1:3000/painel`
