# EdeVida Android

App Android (APK pessoal) do EdeVida via Capacitor.

## Status da fase

Fase A1 iniciada: scaffold Android criado e pronto para evoluir.

## Estrutura deste diretorio

- `capacitor.config.json`: configuracao do app Capacitor
- `android/`: projeto nativo Android gerado pelo Capacitor
- `scripts/`: atalhos de sync e build APK
- `package.json`: comandos locais do app Android

## Comandos principais

```bash
cd apps/android
npm install
npm run doctor
npm run sync
npm run open
npm run build:debug
```

Pre-requisitos do host:

1. Java (JDK) instalado.
2. Android SDK instalado (padrao esperado: `~/Android/Sdk`).

Atalhos shell:

```bash
cd apps/android
./scripts/sync-capacitor.sh
./scripts/build-apk.sh debug
./scripts/build-apk.sh release
```

Observacao:

- `build-apk.sh` detecta `JAVA_HOME` e cria `android/local.properties` automaticamente usando `ANDROID_SDK_ROOT` (ou `~/Android/Sdk`).

## Saidas esperadas

- APK debug:
  - `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`
- APK release:
  - `apps/android/android/app/build/outputs/apk/release/app-release.apk`

## Regras de organizacao

1. Logica de negocio permanece no backend (`apps/api`).
2. Ajustes de UI compartilhada ficam no web (`apps/web`).
3. Codigo exclusivo do Android fica em `apps/android`.

## Planejamento oficial

`doc-ia/plano-android-edevida.md`
