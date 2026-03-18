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
- [x] Atividade 4 - Configurar bot Telegram e webhook
- [x] Atividade 5 - Integrar OpenAI (texto) para analise nutricional
- [x] Atividade 6 - Definir persona da IA nutricionista (OpenAI)
- [x] Atividade 7 - Integrar foto de refeicao (visao) e registrar no banco
- [x] Atividade 8 - Integrar audio (transcricao) e registrar no banco
- [x] Atividade 9 - Registrar e analisar exames medicos e bioimpedancia
- [x] Atividade 10 - Criar regras de relatorio diario/semanal
- [x] Atividade 11 - Criar painel web inicial
- [x] Atividade 12 - Deploy na VPS (producao atual)
- [x] Atividade 13 - Preparar migracao para Hostinger (Node hosting)
- [x] Atividade 14 - Preparar base para modulo futuro de atividade fisica

---

## Ajustes Pos-Feedback (17/03/2026)

Melhorias aplicadas apos uso real no web/telegram:

- filtro de data com padrao no dia atual;
- painel com comparativo "Hoje x Ideal" (agua, refeicoes e exercicio);
- bloco especifico de exercicios no dashboard;
- detalhamento melhor da analise alimentar no formulario web (item por item);
- modo de conversa sem registro no web (`Somente conversar`);
- Telegram com novos comandos:
  - `/resumo` (resumo completo do dia),
  - `/exames` (foco em marcadores de rins/figado e alertas do exame recente),
  - `/chat` (conversa sem registrar refeicao),
  - deteccao de mensagem com `?` para modo conversa;
- Telegram com atalhos no teclado (sem precisar digitar tudo): `Resumo de hoje`, `Abrir painel`, `Falar com IA`;
- `/resumo` com fallback inteligente: se o dia estiver sem lancamentos, mostra os ultimos registros para evitar resposta "zerada" sem contexto;
- Telegram com foco de uso diario:
  - novo comando `/corpo` (visao geral do corpo em 5 niveis),
  - resumo clinico integrado no `/resumo`,
  - `/exames` com impacto rapido dos marcadores alterados;
- dashboard principal com visao de corpo inteiro (IA) em 5 niveis:
  - `Emergencia`, `Ruim`, `Ainda da para melhorar`, `Bom`, `Otimo`,
  - cartoes de sistemas (gordura corporal, figado, rins, colesterol/triglicerides, glicose/diabetes),
  - bio gordura com `Atual x Ideal` e coloracao por risco;
- refinamento de UX (pedido de limpeza visual):
  - dashboard clinico mais limpo (cards compactos, sem excesso de texto),
  - aba nutricao detalhada restrita a refeicoes por periodo (`cafe da manha`, `lanche da manha`, `almoco`, `lanche da tarde`, `janta`, `ceia`);
- chat da IA mais objetivo (respostas curtas e diretas, sem formato de relatorio);
- upload de exame com modelo mais forte e prompt especialista (enfoque nefro + cardio), com exame tendo prioridade clinica sobre bioimpedancia;
- aba de exames com impacto pratico por marcador alterado;
- web com registro alimentar por `foto` e `audio` (alem de texto), com analise e gravacao;
- web com fluxo de rascunho antes de gravar refeicao:
  - analise por texto/foto/audio sem persistir automaticamente,
  - revisao visual em cards (resumo, classificacao, macros, itens e motivo),
  - confirmacao manual em `Registrar refeicao do rascunho` com opcao de ajustar o tipo de refeicao;
- card `Refeicoes hoje` atualizado para mostrar calorias consumidas no periodo (`consumido / meta`) e total de refeicoes;
- rascunho com correcao inteligente (web + telegram):
  - permite corrigir frase tipo `nao era agua, era suco de limao`,
  - revisa o rascunho inteiro e substitui informacao conflitante (em vez de apenas somar).
- aba `Nutricao` com foco calorico e macros:
  - calorias no periodo (`consumido / meta diaria`),
  - calorias por grupo de refeicao (cafe, almoco, janta, etc.),
  - macros consumidos x alvo diario (`proteina`, `carboidrato`, `gordura`).
- dashboard alimentar com leitura de meta mais clara:
  - total de calorias do periodo com status visual (`verde` dentro da meta, `vermelho` acima),
  - calorias por grupo de refeicao em formato `consumido / meta do periodo` com mesma regra de cor.
- card `Exercicios no periodo` com gasto energetico estimado (`kcal`) para facilitar leitura de balanco diario.
- aba `IA` no painel:
  - capacidades da IA,
  - modelos em uso,
  - preview e prompt completo da persona ativa.
- nutricao com visual mais compacto:
  - removido bloco separado de `calorias por grupo`,
  - calorias `consumido / meta` agora ficam no proprio card de cada refeicao.
- padronizacao de status de qualidade para linguagem mais clara:
  - `otimo`, `bom`, `cuidado`, `ruim`, `critico` (mantendo compatibilidade com classificacoes antigas).
- bloco de macros revisado:
  - indicador simples `ok` (verde) e `acima` (vermelho),
  - adicao de sinais IA para `sodio` e `acucar` por refeicoes do periodo,
  - exibicao em formato `consumido x ideal` com percentual para reduzir ambiguidade.
- formato clinico dos cards de risco nutricional:
  - `Acucar: X g (ideal ate Y g)`,
  - `Excesso: +Z g`,
  - `Frequencia: N de M refeicoes`.
- detalhado de alimentacao com mais contexto por refeicao:
  - linha de macros (`kcal`, `P`, `C`, `G`) por registro,
  - sinais IA de `sodio` e `acucar` para identificar melhor o que pode estar prejudicando,
  - detalhamento por alimento com macros e estimativa de `sodio/acucar`.
- card de agua aprimorado:
  - mostra `consumido / ideal` no periodo filtrado,
  - mostra sugestao de distribuicao diaria em tomadas (8-10 ao dia).
- chat da IA mais conversacional e contextualizado com historico clinico (menos resposta engessada);
- protecao para nao registrar hidratacao automatica fora de faixa por mensagem (anti-hallucination).

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
OPENAI_MODEL_TEXT=gpt-4.1-mini
OPENAI_MODEL_VISION=gpt-4.1-mini
OPENAI_MODEL_TRANSCRIBE=gpt-4o-mini-transcribe

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

APP_TIMEZONE=America/Sao_Paulo
```

Observacoes:
- Os nomes dos modelos podem ser ajustados depois por custo/qualidade.
- Padrao sugerido para custo/beneficio atual: `gpt-4.1-mini` (texto e visao) + `gpt-4o-mini-transcribe` (audio).
- O backend ja possui fallback automatico de modelo para reduzir travas quando um modelo nao estiver liberado na sua conta.
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

---

## Atualizacoes tecnicas realizadas em 17/03/2026

- Painel web reformulado com abas: Dashboard, Registros, Anexos e Historico.
- Adicionados graficos de evolucao: peso, gordura corporal e hidratacao diaria.
- Historico exibido em listas visuais para: medidas, bioimpedancia, exames, hidratacao, treinos e alimentacao.
- Botao de relatorio diario agora atualiza lista visivel no painel (sem ficar "invisivel").
- Upload de anexos com compressao automatica de imagem no backend para economizar espaco.
- Arquivos anexados ficam salvos em `temp/uploads` e expostos em URL web via `/uploads/...`.
- Links de anexo de exames aparecem no historico para abrir direto no navegador.
- Tratamento melhor de erro de upload grande (retorno claro para limite de 25 MB).
- Fallback automatico de modelos OpenAI implementado:
  - texto/visao: tenta modelo configurado e, se indisponivel, cai para `gpt-4.1-mini` e `gpt-4o-mini`;
  - transcricao: fallback para `gpt-4o-mini-transcribe` e `gpt-4o-transcribe`.
- Recomendacao de seguranca aplicada no Git: `temp/` ignorado por padrao para evitar commit de arquivos pessoais.

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

---

## Registro de Execucao - Rodada Completa (2026-03-17)

Este bloco registra o que foi implementado e validado na sequencia das Atividades 5 a 14.

### Atividade 5 - OpenAI texto

Entregue:
- servico `nutritionAiService` com schema JSON estruturado
- classificacao obrigatoria de qualidade em 5 niveis
- persistencia em `nutrition_entries`, `hydration_logs` e `ai_interactions`
- fallback seguro para indisponibilidade/quota da OpenAI

Validacao:
- webhook processando mensagem e respondendo sem derrubar a API mesmo quando a OpenAI falha

### Atividade 6 - Persona IA

Entregue:
- documento `doc-ia/persona-ia-edevida.md` como fonte principal da persona
- carregamento da persona no backend via `personaService`
- regras de resposta padronizadas no prompt do sistema

### Atividade 7 - Foto de refeicao (visao)

Entregue:
- processamento de foto Telegram (`message.photo`)
- download do arquivo via API do Telegram
- analise de imagem com modelo de visao OpenAI
- registro da analise no Supabase com `input_type=photo`

### Atividade 8 - Audio (transcricao)

Entregue:
- processamento de `voice` e `audio` do Telegram
- download temporario em `temp/runtime`
- transcricao com OpenAI
- analise nutricional do texto transcrito
- registro no Supabase com `input_type=audio`

### Atividade 9 - Exames e bioimpedancia

Entregue:
- endpoints para perfil, medidas, bioimpedancia e exames:
  - `POST/GET /api/profile`
  - `POST/GET /api/measurements`
  - `POST/GET /api/bioimpedance`
  - `POST /api/bioimpedance/upload` (anexo imagem + IA)
  - `POST/GET /api/medical-exams`
  - `POST /api/medical-exams/upload` (anexo PDF/imagem + IA)
- suporte a marcadores de exame em JSON
- fallback quando OpenAI estiver sem credito/quota (arquivo salvo e resposta de reprocessamento)

### Atividade 10 - Relatorios

Entregue:
- geracao de relatorios por periodo (`daily`, `weekly`, `monthly`)
- agregacao de nutricao, hidratacao e treinos
- tendencias de peso/gordura/massa muscular
- persistencia em `daily_reports`
- endpoints:
  - `POST /api/reports/generate`
  - `GET /api/reports`

### Atividade 11 - Painel web inicial

Entregue:
- painel em `/painel` (assets em `/web/*`)
- formularios para:
  - analise nutricional por texto
  - registro de agua
  - perfil base
  - medidas corporais
  - bioimpedancia
  - exame medico
  - treino
- visao de dashboard + ultimos relatorios
- melhorias de nutricao (18/03/2026):
  - cards de macros com status `ok/abaixo/acima` para proteina, carboidrato e gordura
  - novos cards de `gordura boa (estimada)` e `gordura ruim (estimada)`
  - nos cards de risco (`sodio` e `acucar`), exibicao de principais alimentos contribuintes
  - no detalhado por alimento: macros coloridas + gordura boa/ruim + destaque de impacto quando o alimento puxa excesso do periodo
  - no resumo da refeicao: `P/C/G` com cor e linha separada de `gordura boa` vs `gordura ruim`
  - schema da IA atualizado para aceitar `fat_good_g` e `fat_bad_g` (total e por item), melhorando a precisao para seu caso clinico
  - filtro de data com navegacao rapida por setas (`< dia anterior` e `proximo dia >`) sem digitar
  - resumo do filtro exibindo dia da semana (ex.: `Dia aplicado: Terça-feira, 17/03/2026`)
  - em cada alimento no detalhado: linha `Alternativas melhores: ...` para troca imediata de opcao
  - aba `Registros` reorganizada por blocos: `Cadastro base`, `Lancamentos do dia a dia` e orientacao para consulta na aba `Historico`
  - em `Registros`, `Registro dos alimentos` fica sempre em primeiro, com destaque visual antes de `Outros lancamentos`
  - criada aba `Cadastro` para separar dados base e evolucao corporal (perfil, foto com medidas e medidas manuais)
  - removidos os formularios manuais de `Exame medico` e `Bioimpedancia` (fluxo oficial via aba `Anexos`)
  - no formulario `Analisar alimentacao (foto)`: opcao de `tirar foto agora` ou `escolher da galeria`

### Atividade 12 - Deploy VPS

Entregue:
- `pm2`, `nginx` e `certbot` ja validados em producao
- scripts de operacao:
  - `infra/deploy/scripts/preflight-vps.sh`
  - `infra/deploy/scripts/deploy-api.sh`
- documentacao atualizada em `infra/deploy/README.md`

### Atividade 13 - Migracao Hostinger

Entregue:
- guia dedicado em `infra/deploy/hostinger/README.md`
- checklist de corte e rollback
- variaveis de ambiente necessarias para migracao

### Atividade 14 - Base modulo personal trainer

Entregue:
- endpoints de treino (`POST/GET /api/workouts`)
- recomendacao inicial de treino:
  - `GET /api/workouts/recommendation`
- regra inicial conectando hidratacao + carga semanal + ultima qualidade alimentar

### Validacoes executadas

- [x] Sintaxe de todos os arquivos JS validada (`node --check`)
- [x] API iniciando corretamente em ambiente de teste
- [x] Smoke tests HTTP (health, users, profile, hidratacao, medidas, bioimpedancia, exames, treinos, dashboard, relatorios)
- [x] `/painel` respondendo HTTP 200
- [x] webhook Telegram respondendo com JSON valido

### Registro inicial real do usuario (17/03/2026)

- [x] Bioimpedancia inicial importada de `temp/bio.jpg` (Fitdays, 08:28)
- [x] Medicao corporal inicial sincronizada com os dados da bioimpedancia
- [x] Limpeza dos dados de teste anteriores para iniciar historico limpo

### Ponto que depende de voce

- [ ] Garantir credito/quota na OpenAI para analise completa (texto/foto/audio) sem fallback.

Sem credito/quota, o sistema continua no ar e responde com aviso de indisponibilidade da IA, sem quebrar o fluxo.
