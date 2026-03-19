# EdeVida - Guia Tecnico de Manutencao

Este documento registra como o sistema foi montado e como ajustar no futuro sem perder contexto.

## 1) Arquitetura atual

- Backend: `apps/api` (Node.js + Express)
- Painel web: `apps/web/public` (HTML/CSS/JS sem framework)
- Banco: Supabase PostgreSQL
- Bot: Telegram via webhook em `POST /webhook/telegram`
- IA: OpenAI para texto, imagem, audio e analise de anexos clinicos

Estado atual relevante:

- Aba `Cadastro` foi renomeada para `Info`.
- `Info` mostra bloco de uso do sistema (projeto local, banco Supabase, Storage e contagens de registros).
- Endpoint de suporte: `GET /api/system/usage`.
- Endpoint de anexo privado: `GET /api/files/open?file_url=...` (URL assinada sob demanda).
- Endpoint de anexo privado tambem suporta `mode=url` para retornar URL assinada em JSON:
  - `GET /api/files/open?file_url=...&mode=url`
- Login web ativo com Supabase Auth:
  - `GET /api/auth/config`
  - `GET /api/auth/me`
  - Middleware de proteção em `apps/api/src/middleware/webAuthMiddleware.js`
  - Whitelist opcional de e-mail em `WEB_AUTH_ALLOWED_EMAILS` para acesso pessoal unico
  - Limite de sessao web em horas via `WEB_AUTH_SESSION_MAX_HOURS` (atual: 12h)
- Rota raiz redireciona para o painel:
  - `GET /` -> `302 /painel`

## 2) Pastas principais

- `apps/api/src/controllers/telegramController.js`: menu, comandos e fluxo de rascunho no Telegram
- `apps/api/src/controllers/trackingController.js`: endpoints web (nutricao, exames, bioimpedancia, medidas, anexos)
- `apps/api/src/services/nutritionAiService.js`: prompt e parse de analise nutricional
- `apps/api/src/services/healthAttachmentAiService.js`: analise de exames e bioimpedancia por anexo
- `apps/web/public/app.js`: toda logica do painel, abas e graficos
- `apps/android`: empacotamento Android via Capacitor (fase A1 iniciada)
- `infra/supabase/migrations/20260317_atividade3_schema.sql`: schema oficial do banco

## 3) Fluxo principal

1. Usuario envia texto/foto/audio no Telegram.
2. Backend processa com OpenAI (sem salvar direto).
3. Sistema monta rascunho.
4. Usuario corrige se preciso.
5. Usuario confirma em `Registrar refeicao`.
6. Backend persiste em `nutrition_entries` (+ `hydration_logs` quando aplicavel).
7. Painel web e Telegram leem os mesmos dados do Supabase.

Fluxo de anexos (atual):

1. Upload chega no backend (`multer` em memoria).
2. Imagem e otimizada/comprimida quando aplicavel (`sharp`).
3. Arquivo e salvo em Supabase Storage privado (ou fallback local).
4. Banco salva referencia canonica (`supabase://...` ou `local://...`).
5. Web abre arquivo por `/api/files/open`, que resolve URL assinada no momento do clique.
6. Frontend usa `mode=url` para resolver URL assinada antes de abrir miniatura/arquivo protegido.

Fluxo de foto de evolucao (atual):

1. Upload cria registro em `body_measurements` com `progress_photo_url`.
2. Card no dashboard permite exclusao direta da foto:
   - `DELETE /api/measurements/:id`
3. Exclusao remove registro e tenta apagar arquivo associado.

Fluxo de edicao (web):

1. Usuario abre `Nutricao > Detalhado de alimentacao`.
2. Clica em `Editar lancamento` dentro do card da refeicao.
3. Ajusta grupo alimentar, resumo, alimentos e data/hora.
4. Web salva com `PATCH /api/nutrition/:id`.
5. Painel recarrega e exibe confirmacao `Cadastro atualizado com sucesso`.

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

Observacao de audio:

- audios de voz do Telegram (`.oga/.opus`) sao normalizados automaticamente para `.ogg` antes da transcricao, evitando falha por formato.

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
No modo Storage Supabase ativo, a limpeza de `temp/` age como contingencia local.

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
- Ajustar compatibilidade de transcricao de audio: `apps/api/src/services/nutritionAiService.js` e `apps/api/src/services/telegramMessageProcessor.js`
- Ajustar endpoint de edicao de lancamentos: `apps/api/src/controllers/trackingController.js` + `apps/api/src/services/trackingDataService.js`
- Ajustar monitor de uso (painel Info): `apps/api/src/services/systemUsageService.js` + `GET /api/system/usage`

## 7) Arquitetura alvo (implementada nesta fase)

Direcao aplicada para reduzir acoplamento com VPS:

1. Supabase Postgres como base oficial de dados.
2. Supabase Storage privado para exames e fotos.
3. API stateless na hospedagem (Hostinger), sem depender de disco local para anexos.
4. Arquivo local apenas em fallback/contingencia.
5. Supabase Auth para login web quando ativado.

Compressao/otimizacao de imagem:

- Ja existe no backend em `apps/api/src/services/attachmentStorageService.js` usando `sharp`.
- Mesmo com Storage no Supabase, manter o passo de otimizacao antes do upload para reduzir custo.

Variaveis de ambiente do Storage:

```env
SUPABASE_STORAGE_ENABLED=true
SUPABASE_STORAGE_BUCKET=edevida-private
SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS=900
```

Variaveis de ambiente do Auth web (recomendado para uso pessoal):

```env
WEB_AUTH_ENABLED=true
WEB_AUTH_ALLOWED_EMAILS=edersonlcs@hotmail.com
WEB_AUTH_SESSION_MAX_HOURS=12
```

Cache web de painel (frontend):

- Existe cache por sessao (sessionStorage) para reduzir recarga completa em F5.
- Chave: `edevida_panel_cache_v1`
- TTL atual: 5 minutos
- Acoes de escrita (salvar/excluir) invalidam cache e forcam reload completo.

## 8) Checklist rapido pos-alteracao

1. `node --check apps/api/src/controllers/telegramController.js`
2. `node --check apps/api/src/controllers/trackingController.js`
3. `node --check apps/web/public/app.js`
4. Subir API e validar:
   - `/health`
   - `/painel`
   - botao `/help` no Telegram
   - fluxo rascunho > registrar no Telegram
5. Commit com mensagem clara do bloco alterado.

## 9) Android (A1-A6 atual)

Comandos:

```bash
cd apps/android
npm install
npm run doctor
npm run sync
npm run build:debug
npm run build:release
./scripts/generate-keystore.sh
APK_KEYSTORE_PASSWORD='sua_senha' APK_KEY_PASSWORD='sua_senha' ./scripts/sign-release.sh
```

Pre-requisitos do host:

- Java (JDK) instalado
- Android SDK instalado (preferencia em `~/Android/Sdk`)

Scripts locais:

- `apps/android/scripts/sync-capacitor.sh`
- `apps/android/scripts/build-apk.sh`
- `apps/android/scripts/generate-keystore.sh`
- `apps/android/scripts/sign-release.sh`

Saida do build debug:

- `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`
- `apps/android/android/app/build/outputs/apk/release/app-release-signed.apk`
