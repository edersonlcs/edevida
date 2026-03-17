# EdeVida

Aplicacao pessoal para acompanhamento de nutricao, hidratacao, medidas corporais, exames, bioimpedancia e evolucao fisica.

## Estrutura

- `apps/api`: backend Node.js (Telegram + OpenAI + Supabase)
- `apps/web`: painel web (acompanhamento)
- `packages/shared`: itens compartilhados
- `infra/supabase`: migrations e scripts SQL
- `infra/deploy`: configuracoes de deploy VPS e migracao
- `doc-ia`: plano de atividades e registros

## Execucao local

```bash
cd apps/api
npm install
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```
