#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
ANDROID_DIR="${APP_DIR}/android"
RELEASE_DIR="${ANDROID_DIR}/app/build/outputs/apk/release"
UNSIGNED_APK="${RELEASE_DIR}/app-release-unsigned.apk"
SIGNED_APK="${RELEASE_DIR}/app-release-signed.apk"

if [[ -z "${JAVA_HOME:-}" ]]; then
  if command -v javac >/dev/null 2>&1; then
    JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
    export JAVA_HOME
  fi
fi

if [[ -z "${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -d "${HOME}/Android/Sdk" ]]; then
    ANDROID_SDK_ROOT="${HOME}/Android/Sdk"
  elif [[ -d "/usr/lib/android-sdk" ]]; then
    ANDROID_SDK_ROOT="/usr/lib/android-sdk"
  fi
  export ANDROID_SDK_ROOT
fi

if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
  printf 'sdk.dir=%s\n' "${ANDROID_SDK_ROOT}" > "${ANDROID_DIR}/local.properties"
fi

KEYSTORE_PATH="${APK_KEYSTORE_PATH:-${PROJECT_ROOT}/temp/android-keys/edevida-release.jks}"
KEY_ALIAS="${APK_KEY_ALIAS:-edevida}"
STORE_PASS="${APK_KEYSTORE_PASSWORD:-}"
KEY_PASS="${APK_KEY_PASSWORD:-${STORE_PASS}}"

if [[ ! -f "${KEYSTORE_PATH}" ]]; then
  echo "Keystore nao encontrado em ${KEYSTORE_PATH}"
  echo "Execute: ./scripts/generate-keystore.sh"
  exit 1
fi

if [[ -z "${STORE_PASS}" ]]; then
  echo "Defina APK_KEYSTORE_PASSWORD para assinar o APK."
  exit 1
fi

if [[ ! -f "${UNSIGNED_APK}" ]]; then
  echo "APK release ainda nao existe. Gerando assembleRelease..."
  (cd "${APP_DIR}" && npm run build:release)
fi

BUILD_TOOLS_DIR="${ANDROID_SDK_ROOT}/build-tools"
if [[ ! -d "${BUILD_TOOLS_DIR}" ]]; then
  echo "Nao foi possivel localizar build-tools em ${BUILD_TOOLS_DIR}"
  exit 1
fi

LATEST_BUILD_TOOLS="$(find "${BUILD_TOOLS_DIR}" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
if [[ -z "${LATEST_BUILD_TOOLS}" ]]; then
  echo "Nenhuma versao de build-tools encontrada."
  exit 1
fi

APKSIGNER_BIN="${LATEST_BUILD_TOOLS}/apksigner"
if [[ ! -x "${APKSIGNER_BIN}" ]]; then
  APKSIGNER_BIN="apksigner"
fi

"${APKSIGNER_BIN}" sign \
  --ks "${KEYSTORE_PATH}" \
  --ks-key-alias "${KEY_ALIAS}" \
  --ks-pass "pass:${STORE_PASS}" \
  --key-pass "pass:${KEY_PASS}" \
  --out "${SIGNED_APK}" \
  "${UNSIGNED_APK}"

"${APKSIGNER_BIN}" verify "${SIGNED_APK}"

echo "APK release assinado gerado em:"
echo "${SIGNED_APK}"
