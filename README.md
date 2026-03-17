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

Painel web:

```bash
curl http://127.0.0.1:3000/painel
```

## Funcionalidades implementadas (MVP atual)

- Webhook Telegram com seguranca por `TELEGRAM_WEBHOOK_SECRET`
- Registro de mensagens Telegram no Supabase (`telegram_updates`)
- Analise nutricional por texto com OpenAI
- Analise de foto de refeicao (visao) com OpenAI
- Analise de audio (transcricao + analise) com OpenAI
- Classificacao de qualidade da refeicao em 5 niveis:
  - `otimo`
  - `bom`
  - `ainda pode, mas pouco`
  - `ruim`
  - `nunca coma`
- Registro automatico de hidratacao quando detectado na analise
- API para perfil, metas, medidas corporais, bioimpedancia, exames, hidratacao e treinos
- Relatorios diarios/semanais/mensais com resumo agregado
- Painel web inicial em `/painel`
- Recomendacao inicial de treino (base para modulo personal trainer)

## Endpoints principais

- `GET /health`
- `POST /webhook/telegram`
- `GET /api/telegram/webhook-info`
- `GET /api/users?auto_create=1`
- `POST /api/nutrition/analyze-text`
- `POST /api/hydration`
- `POST /api/measurements`
- `POST /api/bioimpedance`
- `POST /api/bioimpedance/upload` (anexo imagem + IA)
- `POST /api/medical-exams`
- `POST /api/medical-exams/upload` (anexo PDF/imagem + IA)
- `POST /api/workouts`
- `POST /api/reports/generate`
- `GET /api/dashboard/overview`

## Deploy

- VPS: `infra/deploy/README.md`
- Hostinger (migracao futura): `infra/deploy/hostinger/README.md`
