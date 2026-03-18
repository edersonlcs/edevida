# EdeVida - Guia Tecnico de Manutencao

Este documento registra como o sistema foi montado e como ajustar no futuro sem perder contexto.

## 1) Arquitetura atual

- Backend: `apps/api` (Node.js + Express)
- Painel web: `apps/web/public` (HTML/CSS/JS sem framework)
- Banco: Supabase PostgreSQL
- Bot: Telegram via webhook em `POST /webhook/telegram`
- IA: OpenAI para texto, imagem, audio e analise de anexos clinicos

## 2) Pastas principais

- `apps/api/src/controllers/telegramController.js`: menu, comandos e fluxo de rascunho no Telegram
- `apps/api/src/controllers/trackingController.js`: endpoints web (nutricao, exames, bioimpedancia, medidas, anexos)
- `apps/api/src/services/nutritionAiService.js`: prompt e parse de analise nutricional
- `apps/api/src/services/healthAttachmentAiService.js`: analise de exames e bioimpedancia por anexo
- `apps/web/public/app.js`: toda logica do painel, abas e graficos
- `infra/supabase/migrations/20260317_atividade3_schema.sql`: schema oficial do banco

## 3) Fluxo principal

1. Usuario envia texto/foto/audio no Telegram.
2. Backend processa com OpenAI (sem salvar direto).
3. Sistema monta rascunho.
4. Usuario corrige se preciso.
5. Usuario confirma em `Registrar refeicao`.
6. Backend persiste em `nutrition_entries` (+ `hydration_logs` quando aplicavel).
7. Painel web e Telegram leem os mesmos dados do Supabase.

## 4) Telegram (estado atual)

Teclado principal:

- `Resumo de hoje`
- `Nutricao de hoje`
- `Status do corpo`
- `Exames`
- `Sugestao proxima refeicao`
- `Plano de hoje`
- `Falar com IA`
- `Rascunho atual`
- `Registrar refeicao`
- `Painel`
- `Help`

Comandos:

- `/help` ou `/start`
- `/resumo`
- `/nutricao`
- `/corpo`
- `/exames`
- `/rascunho`
- `/chat <pergunta>`
- `/painel`

## 5) Limpeza de dados de teste

Script criado:

- `apps/api/scripts/reset-test-data.js`

Comandos:

```bash
cd apps/api
npm run reset:test-data:dry
npm run reset:test-data
```

O reset remove dados de uso (refeicoes, agua, treinos, exames, bioimpedancia, medidas, relatorios e interacoes IA), limpa `telegram_updates` e apaga arquivos locais em `temp/` (mantendo estrutura base).

Flags uteis:

- `--dry-run`: apenas mostra o que seria apagado
- `--keep-profile`: preserva `user_profiles`
- `--keep-goals`: preserva `user_goals`
- `--skip-files`: nao limpa `temp/`
- `--keep-telegram-updates`: preserva `telegram_updates`

## 6) Onde ajustar cada parte

- Melhorar respostas do Telegram: `apps/api/src/controllers/telegramController.js`
- Ajustar persona nutricional/chat: `apps/api/src/services/nutritionAiService.js`
- Ajustar analise de exames: `apps/api/src/services/healthAttachmentAiService.js`
- Ajustar dashboard/web: `apps/web/public/app.js` + `apps/web/public/index.html` + `apps/web/public/styles.css`

## 7) Checklist rapido pos-alteracao

1. `node --check apps/api/src/controllers/telegramController.js`
2. `node --check apps/api/src/controllers/trackingController.js`
3. `node --check apps/web/public/app.js`
4. Subir API e validar:
   - `/health`
   - `/painel`
   - botao `/help` no Telegram
   - fluxo rascunho > registrar no Telegram
5. Commit com mensagem clara do bloco alterado.
