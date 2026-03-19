# EdeVida - Plano Android (APK Pessoal)

## Objetivo

Criar um app Android instalavel por APK, mantendo o que ja funciona no web e no Telegram, com layout otimizado para celular.

## Status atual (19/03/2026)

Fases A1 a A6 executadas nesta rodada.

- [x] A1 - Base Android e build inicial
- [x] A2 - Layout mobile-first
- [x] A3 - Fluxos mobile de foto/audio/anexo
- [x] A4 - Ajustes de sessao/performance para uso em app
- [x] A5 - Assinatura e release APK
- [x] A6 - Documentacao operacional

## Decisao tecnica recomendada

Para o seu caso (uso pessoal, sem Play Store), a melhor rota e:

1. Base atual continua em `apps/web` e `apps/api`.
2. Criar `apps/android` com `Capacitor` para gerar APK Android.
3. Reaproveitar telas web, mas com layout mobile-first.

Motivo:

- menor custo e menor retrabalho;
- mesma regra de negocio e mesma API;
- evolui rapido e continua simples de manter.

## Separacao clara: Web x Android

### Web

- `apps/web`: layout, telas, interacoes e graficos.
- roda no navegador (desktop e mobile web).

### Android

- `apps/android`: projeto de empacotamento mobile (Capacitor + Android Studio).
- gera APK para instalar no seu celular.
- pode usar o mesmo backend remoto (`https://edevida.edexterno.com.br`).

### Backend compartilhado

- `apps/api`: continua sendo backend unico para web, Telegram e Android.
- `infra/` e `packages/` seguem compartilhados.

## Estrutura de pastas alvo

```txt
apps/
  api/
  web/
  android/
    README.md
    capacitor.config.ts
    android/                  # projeto nativo gerado pelo Capacitor
    scripts/
      build-apk.sh
      sync-capacitor.sh
```

## Plano por fases

## Fase A1 - Base Android e Build inicial

Objetivo: gerar primeiro APK tecnico.

Entregas:

1. Inicializar `apps/android` com Capacitor.
2. Conectar com o frontend web atual.
3. Abrir no Android Studio.
4. Gerar APK debug para teste local.

Esforco estimado: **baixo a medio** (0,5 a 1 dia).

## Fase A2 - Layout mobile-first (maior esforco)

Objetivo: deixar a experiencia realmente de app.

Entregas:

1. Revisao de todas as abas no viewport mobile.
2. Barra de navegacao inferior para as abas principais.
3. Ajuste de tipografia, espacamento, cards e botoes para toque.
4. Melhorias de formulários (inputs maiores, menos rolagem inutil).
5. Graficos adaptados para tela pequena (altura, legenda, densidade).

Esforco estimado: **alto** (3 a 6 dias).

Observacao: este e o bloco de maior trabalho.

## Fase A3 - Recursos mobile (camera/audio/anexo)

Objetivo: fluxo rapido de uso no Android.

Entregas:

1. Acoes de foto via camera ou galeria.
2. Upload de audio/voz e anexos com feedback claro.
3. Permissoes Android tratadas (camera/microfone/arquivos).
4. Validacao de erros em rede fraca.

Esforco estimado: **medio** (2 a 3 dias).

## Fase A4 - Sessao, desempenho e UX de app

Objetivo: reduzir friccao no uso diario.

Entregas:

1. Persistencia de sessao no app.
2. Cache local de leitura para abrir mais rapido.
3. Melhor feedback de loading/sucesso/erro.
4. Ajustes de refresh para evitar recarga pesada.

Esforco estimado: **medio** (1 a 2 dias).

## Fase A5 - Seguranca, assinatura e release pessoal

Objetivo: APK pronto para uso pessoal continuo.

Entregas:

1. Gerar keystore propria.
2. Build APK release assinado.
3. Guia de instalacao no seu Android.
4. Checklist de backup da keystore.

Esforco estimado: **baixo** (0,5 a 1 dia).

## Fase A6 - Documentacao e operacao

Objetivo: facilitar manutencao futura.

Entregas:

1. Guia de build/update do APK.
2. Lista de diferenca entre web e Android.
3. Checklist de regressao (web, Telegram, Android).

Esforco estimado: **baixo** (0,5 dia).

## Estimativa total

- Versao funcional Android: **7 a 13 dias uteis**.
- Maior variavel: refinamento de layout mobile (A2).

## Regras de organizacao do codigo

1. Regra de negocio permanece no backend (`apps/api`).
2. Android nao duplica logica de negocio, apenas UX mobile.
3. Toda alteracao mobile no frontend deve ser marcada com comentario curto quando for especifica de app.
4. O que for exclusivo do Android fica em `apps/android`.
5. O que for compartilhado com web fica em `apps/web`.

## Riscos e mitigacao

1. Risco: layout ficar "site dentro do app".
   Mitigacao: fase A2 dedicada com revisao de UX por tela.
2. Risco: divergencia entre web e app.
   Mitigacao: backend unico + checklist de regressao.
3. Risco: perder chave de assinatura APK.
   Mitigacao: backup seguro da keystore e senha.

## Proxima acao sugerida

APK final pronto para instalar:

- `apps/android/android/app/build/outputs/apk/release/app-release-signed.apk`

Se quiser, proximo ciclo sera visual (A2 refinamento fino): polimento por tela com base no seu uso real no celular.
