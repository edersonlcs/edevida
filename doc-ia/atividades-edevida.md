# EdeVida - Plano de Atividades (Passo a Passo)

## Como vamos trabalhar

1. Vamos executar **1 atividade por vez**.
2. Voce faz a atividade no seu ritmo e tira duvidas comigo.
3. So avancamos para a proxima atividade quando voce escrever: **"pode ir para a proxima"**.
4. Ao final de cada atividade:
   - eu valido com voce o que foi feito;
   - eu te mostro a mensagem de commit sugerida;
   - somente com sua autorizacao eu faco commit e push.
5. Exigencia fixa: sempre seguir este arquivo como fonte oficial de passos: `doc-ia/atividades-edevida.md`.

---

## Visao Geral da Solucao

Teremos 3 frentes principais:

1. **Bot Telegram (entrada principal)**
   - Recebe texto, audio e foto.
   - Envia para API Node.js.
   - API registra no Supabase e usa OpenAI para analise nutricional.
   - Permite enviar exames medicos e resultados de bioimpedancia para analise de evolucao.

2. **API Node.js (backend central)**
   - Regras de negocio (nutricao, registros, relatorios).
   - Cadastro completo de dados para acompanhamento (peso, altura, medidas, exames, bioimpedancia e treino).
   - Integracao com Supabase.
   - Integracao com OpenAI.
   - Persona fixa da IA (nutricionista pessoal) com comportamento e limites definidos.
   - Endpoints para o painel web.

3. **Painel Web (acompanhamento)**
   - Dashboard simples com historico de refeicoes, peso e indicadores.
   - Tela para registrar/editar dados corporais, exames medicos e bioimpedancia.
   - Area para relatorios (dia, semana, mes).

Arquitetura pensada para:
- rodar agora na sua VPS;
- migrar depois para hospedagem Node.js da Hostinger com minimo ajuste.

---

## Estrutura de Pastas (alvo)

```txt
edevida/
  doc-ia/
    atividades-edevida.md
  temp/
  apps/
    api/                 # Node.js + Telegram webhook + regras
    web/                 # Painel web
  packages/
    shared/              # tipos, validacoes, utilitarios
  infra/
    supabase/            # SQL migrations, seeds e politicas
    deploy/              # scripts de VPS/Hostinger
  .env.example
  README.md
```

Observacao: podemos simplificar ou expandir conforme evoluirmos.

---

## Escopo de Dados de Acompanhamento (Nutricionista + Personal)

Este sera o pacote de dados que vamos preparar para acompanhar sua evolucao.

1. **Perfil base**
   - nome/apelido
   - data de nascimento
   - sexo biologico
   - altura (cm)
   - rotina (trabalho, horarios, nivel de atividade)

2. **Objetivos**
   - objetivo principal (ex: perder gordura, ganhar massa, recomposicao)
   - peso alvo
   - prazo alvo
   - prioridade (saude, estetica, performance)

3. **Registros corporais periodicos**
   - peso (kg)
   - IMC (calculado)
   - percentual de gordura (se houver)
   - medidas corporais (cintura, abdomen, quadril, peito, braco, coxa, panturrilha)
   - fotos de progresso (opcional)

4. **Bioimpedancia**
   - data da medicao
   - percentual de gordura
   - massa muscular
   - gordura visceral
   - agua corporal
   - metabolismo basal (BMR)
   - idade metabolica (se disponivel)

5. **Exames medicos e checkup**
   - data do exame
   - tipo de exame (hemograma, glicemia, lipidograma, etc.)
   - marcadores principais e valores
   - arquivo anexado (PDF/imagem), quando aplicavel
   - observacoes relevantes

6. **Historico de saude**
   - condicoes pre-existentes
   - alergias/intolerancias
   - medicamentos em uso
   - lesoes e limitacoes fisicas

7. **Rotina de alimentacao e treino**
   - refeicoes registradas (texto, audio, foto)
   - ingestao de agua (ml por dia, horarios, meta diaria)
   - treinos planejados e executados
   - tempo de sono e recuperacao

Observacao: no MVP vamos priorizar peso, altura, medidas principais, exames de checkup e bioimpedancia.

8. **Avaliacao de qualidade da refeicao/bebida (IA)**
   - otimo
   - bom
   - ainda pode, mas pouco
   - ruim
   - nunca coma

---

## Backlog de Atividades

### Atividade 1 - Preparacao de contas, chaves e ambiente local (**iniciar por aqui**)
Objetivo: deixar tudo pronto para comecar a codar sem travas.

### Atividade 2 - Inicializacao do projeto Node.js e estrutura de pastas
Objetivo: criar base da API com organizacao limpa e escalavel.

### Atividade 3 - Criar projeto Supabase e banco inicial
Objetivo: modelar tabelas principais (perfil, objetivos, registros corporais, medidas corporais, exames medicos, bioimpedancia, refeicoes, treinos e logs IA).

### Atividade 4 - Configurar bot Telegram e webhook
Objetivo: receber mensagens de texto no backend.

### Atividade 5 - Integrar OpenAI (texto) para analise nutricional
Objetivo: interpretar o que voce comeu e sugerir orientacoes.

### Atividade 6 - Definir persona da IA nutricionista (OpenAI)
Objetivo: padronizar tom, regras, limites de seguranca e formato das respostas.

### Atividade 7 - Integrar foto de refeicao (visao) e registrar no banco
Objetivo: analisar imagem e transformar em registro alimentar.

### Atividade 8 - Integrar audio (transcricao) e registrar no banco
Objetivo: converter audio em texto, analisar e registrar.

### Atividade 9 - Registrar e analisar exames medicos e bioimpedancia
Objetivo: guardar historico periodico, comparar resultados e gerar analise de melhoria junto com alimentacao e treino.

### Atividade 10 - Criar regras de relatorio diario/semanal
Objetivo: ter resumo automatico de alimentacao e progresso.

### Atividade 11 - Criar painel web inicial
Objetivo: visualizar historico, metricas e relatorios.

### Atividade 12 - Deploy na VPS (producao atual)
Objetivo: deixar rodando com seguranca, logs e reinicio automatico.

### Atividade 13 - Preparar migracao para Hostinger (Node hosting)
Objetivo: reduzir custo depois, sem reescrever projeto.

### Atividade 14 - Preparar base para modulo futuro de atividade fisica
Objetivo: deixar estrutura pronta para personal trainer + impacto na dieta.

---

## Controle de Progresso das Atividades

Regra de marcacao:
- Eu so marco uma atividade como concluida (`[x]`) quando voce disser que finalizou e autorizar ir para a proxima.

- [x] Atividade 1 - Preparacao de contas, chaves e ambiente local
- [x] Atividade 2 - Inicializacao do projeto Node.js e estrutura de pastas
- [x] Atividade 3 - Criar projeto Supabase e banco inicial
- [ ] Atividade 4 - Configurar bot Telegram e webhook
- [ ] Atividade 5 - Integrar OpenAI (texto) para analise nutricional
- [ ] Atividade 6 - Definir persona da IA nutricionista (OpenAI)
- [ ] Atividade 7 - Integrar foto de refeicao (visao) e registrar no banco
- [ ] Atividade 8 - Integrar audio (transcricao) e registrar no banco
- [ ] Atividade 9 - Registrar e analisar exames medicos e bioimpedancia
- [ ] Atividade 10 - Criar regras de relatorio diario/semanal
- [ ] Atividade 11 - Criar painel web inicial
- [ ] Atividade 12 - Deploy na VPS (producao atual)
- [ ] Atividade 13 - Preparar migracao para Hostinger (Node hosting)
- [ ] Atividade 14 - Preparar base para modulo futuro de atividade fisica

---

## Registro de Ambiente VPS (durante Atividade 1)

Status atual de instalacoes na VPS:

- [x] `psql` (PostgreSQL client) instalado e conexao validada no Supabase
- [x] `supabase` CLI instalado (binario oficial)
- [x] `pm2` instalado
- [x] `pnpm` instalado
- [x] `nginx` instalado
- [x] `certbot` e `python3-certbot-nginx` instalados
- [ ] `cloudflared` (nao instalado por escolha sua, pois voce ja possui configuracao)
- [x] Dominio `edevida.edexterno.com.br` respondendo em HTTP e HTTPS

Objetivo deste registro: facilitar auditoria futura do que foi preparado na VPS.

---

## ATIVIDADE 1 (Detalhada) - Preparacao de contas, chaves e ambiente

## Resultado esperado da Atividade 1

Ao final desta atividade voce tera:

1. Projeto Supabase criado.
2. Bot do Telegram criado com token ativo.
3. Chave da OpenAI criada.
4. Arquivo `.env` local preenchido (sem subir segredo no GitHub).
5. Escopo de dados de acompanhamento validado (nutricionista + personal).
6. Documento inicial da persona da IA criado.
7. VPS com ferramentas base instaladas para operar e testar.
8. Checklist de validacao concluido.

---

## Passo 1 - Supabase (console web)

1. Acesse: `https://supabase.com/dashboard`
2. Clique em **New project**.
3. Defina:
   - Organization: a sua.
   - Name: `edevida` (ou `edevida-prod`).
   - Database Password: crie uma senha forte e guarde.
   - Region: escolha a mais proxima do Brasil (normalmente Sao Paulo).
4. Aguarde o provisionamento (pode levar alguns minutos).
5. No projeto criado, copie e guarde:
   - `Project URL`
   - `anon public key`
   - `service_role key` (segredo: nao expor no frontend)

---

## Passo 2 - Telegram bot

1. No Telegram, abra o chat **@BotFather**.
2. Execute `/newbot`.
3. Defina:
   - nome do bot (ex: EdeVida Assistente).
   - username terminado com `bot` (ex: `edevida_ederson_bot`).
4. O BotFather retornara o **BOT TOKEN**. Guarde com cuidado.
5. (Opcional agora) Defina foto e descricao com:
   - `/setuserpic`
   - `/setdescription`

---

## Passo 3 - OpenAI API key

1. Acesse `https://platform.openai.com/`
2. Entre no menu de API keys.
3. Clique em criar nova chave.
4. Salve a chave em local seguro (ela aparece uma vez).
5. Se possivel, configure limite de uso para controle de custo.

---

## Passo 4 - Preparar variaveis de ambiente no projeto

Quando formos iniciar a Atividade 2, vamos criar estes arquivos:

- `.env` (local, com segredos reais)
- `.env.example` (sem segredos, modelo para referencia)

Variaveis previstas:

```env
NODE_ENV=development
PORT=3000

TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=

OPENAI_API_KEY=
OPENAI_MODEL_TEXT=gpt-5-mini
OPENAI_MODEL_VISION=gpt-5-mini
OPENAI_MODEL_TRANSCRIBE=gpt-4o-mini-transcribe

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

APP_TIMEZONE=America/Sao_Paulo
```

Observacoes:
- Os nomes dos modelos podem ser ajustados depois por custo/qualidade.
- Padrao sugerido para custo/beneficio atual: `gpt-5-mini` (texto e visao) + `gpt-4o-mini-transcribe` (audio).
- A `SUPABASE_SERVICE_ROLE_KEY` fica apenas no backend.

---

## Passo 5 - Validar escopo dos seus dados de acompanhamento

Antes de codar, vamos confirmar que o app tera espaco para os dados que voce quer registrar:

1. Altura e peso.
2. Medidas corporais.
3. Exames medicos de checkup.
4. Resultados de bioimpedancia.
5. Dados de treino e limitacoes fisicas.
6. Controle de agua (meta diaria e registro em ml).
7. Classificacao da qualidade da alimentacao em 5 niveis.

Se quiser incluir algo extra (ex: pressao arterial, frequencia cardiaca de repouso), entrara neste passo.

---

## Passo 6 - Definir persona inicial da IA (documento)

Criar um arquivo de referencia para guiar todas as respostas da IA, com:

1. Papel: nutricionista pessoal focada em acompanhamento diario.
2. Tom: claro, direto, acolhedor e sem julgamentos.
3. Regras:
   - sempre considerar seus dados historicos (peso, exames, bioimpedancia, rotina);
   - sempre analisar o que comer e o que beber, com recomendacao objetiva;
   - sempre dizer qualidade da refeicao/bebida em: `otimo`, `bom`, `ainda pode, mas pouco`, `ruim`, `nunca coma`;
   - evitar afirmar diagnostico medico;
   - quando detectar sinal de risco, orientar procura de profissional de saude;
   - responder com orientacao pratica e proximo passo objetivo.
4. Formato padrao de resposta:
   - analise curta da refeicao/bebida;
   - classificacao de qualidade (5 niveis);
   - impacto esperado;
   - recomendacao de acao (o que comer/beber agora e proximo horario).
5. Restricoes:
   - nao inventar valores nutricionais sem sinalizar estimativa;
   - nao substituir conduta medica.

Arquivo de referencia da persona:
- `doc-ia/persona-ia-edevida.md`

---

## Passo 7 - Preparar VPS base para operacao (localhost + hospedagem)

Itens aplicados na VPS:

1. Instalado `psql` e validada conexao no Supabase.
2. Instalado `supabase` CLI para futuras migrations.
3. Instalado `pm2` para gerenciamento de processo Node.
4. Instalado `nginx` para reverse proxy quando necessario.
5. Instalado `certbot` + plugin nginx para SSL (quando usar dominio direto no servidor).
6. Mantido `cloudflared` fora da instalacao por decisao sua (ja possui configuracao separada).
7. Dominio principal validado: `https://edevida.edexterno.com.br/health` com retorno `200`.

Observacao de formato:
- Para seu uso com Zero Trust, a aplicacao pode rodar em `127.0.0.1`.
- Para migracao futura em hospedagem Node gerenciada, ajustar `APP_HOST` para `0.0.0.0` quando exigido.

Arquivos base preparados nesta etapa:
- `apps/api/src/server.js` (endpoint `/health`)
- `apps/api/package.json` (scripts `start` e `dev`)
- `infra/deploy/pm2/ecosystem.config.cjs`
- `infra/deploy/nginx/edevida.localhost.conf.example`
- `infra/deploy/README.md`

---

## Passo 8 - Checklist de validacao da Atividade 1

Marque cada item quando concluir:

- [x] Tenho projeto Supabase criado.
- [x] Guardei URL e chaves do Supabase.
- [x] Tenho bot Telegram criado e token salvo.
- [x] Tenho chave da OpenAI criada.
- [x] Tenho validado quais dados vou registrar no acompanhamento.
- [x] Tenho definido como a persona da IA deve responder.
- [x] Tenho VPS base preparada (psql, supabase, pm2, nginx, certbot).
- [x] Entendi quais segredos nunca vao para GitHub.

Se qualquer item nao estiver ok, ficamos nesta atividade ate resolver.

---

## Regras de seguranca (sempre)

1. Nunca commitar:
   - tokens
   - senhas
   - `.env`
2. Usar sempre `.env.example` para documentar variaveis.
3. Rotacionar chave imediatamente se vazar.

---

## Modelo de commit (quando atividade for concluida)

```txt
docs: cria plano inicial de atividades da EdeVida
```

Descricao sugerida do commit:

```txt
- adiciona roteiro por etapas em doc-ia
- detalha atividade 1 (Supabase, Telegram, OpenAI e ambiente)
- inclui escopo de dados de acompanhamento (nutricao + personal)
- inclui exames medicos, bioimpedancia e persona da IA no planejamento
- define fluxo de execucao uma atividade por vez
```
