# EdeVida Android

App Android (APK pessoal) do EdeVida via Capacitor.

## Status da fase

Fases A1-A6 concluídas nesta rodada (scaffold, mobile UX, build e assinatura release).

## Estrutura deste diretorio

- `capacitor.config.json`: configuracao do app Capacitor
- `android/`: projeto nativo Android gerado pelo Capacitor
- `scripts/`: atalhos de sync, build e assinatura APK
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
./scripts/generate-keystore.sh
APK_KEYSTORE_PASSWORD='sua_senha' APK_KEY_PASSWORD='sua_senha' ./scripts/sign-release.sh
```

Observacao:

- `build-apk.sh` detecta `JAVA_HOME` e cria `android/local.properties` automaticamente usando `ANDROID_SDK_ROOT` (ou `~/Android/Sdk`).
- `generate-keystore.sh` cria keystore em `temp/android-keys` (fora do Git).
- `sign-release.sh` assina e valida o APK release.

## Saidas esperadas

- APK debug:
  - `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`
- APK release:
  - `apps/android/android/app/build/outputs/apk/release/app-release.apk`
  - `apps/android/android/app/build/outputs/apk/release/app-release-signed.apk`

## Instalar no celular

1. Copie para o Android:
   - `apps/android/android/app/build/outputs/apk/release/app-release-signed.apk`
2. No celular, habilite instalação de fontes desconhecidas para seu gerenciador de arquivos.
3. Abra o APK e confirme instalação.
4. Após instalar, desative a opção de fontes desconhecidas novamente.

## Regras de organizacao

1. Logica de negocio permanece no backend (`apps/api`).
2. Ajustes de UI compartilhada ficam no web (`apps/web`).
3. Codigo exclusivo do Android fica em `apps/android`.

## Planejamento oficial

`doc-ia/plano-android-edevida.md`
