#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

KEYSTORE_PATH="${APK_KEYSTORE_PATH:-${PROJECT_ROOT}/temp/android-keys/edevida-release.jks}"
KEY_ALIAS="${APK_KEY_ALIAS:-edevida}"
STORE_PASS="${APK_KEYSTORE_PASSWORD:-}"
KEY_PASS="${APK_KEY_PASSWORD:-}"

if [[ -z "${STORE_PASS}" ]]; then
  STORE_PASS="$(openssl rand -hex 16)"
fi

if [[ -z "${KEY_PASS}" ]]; then
  KEY_PASS="${STORE_PASS}"
fi

mkdir -p "$(dirname "${KEYSTORE_PATH}")"

if [[ -f "${KEYSTORE_PATH}" ]]; then
  echo "Keystore ja existe em: ${KEYSTORE_PATH}"
  exit 0
fi

keytool -genkeypair \
  -v \
  -keystore "${KEYSTORE_PATH}" \
  -alias "${KEY_ALIAS}" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 3650 \
  -storepass "${STORE_PASS}" \
  -keypass "${KEY_PASS}" \
  -dname "CN=EdeVida, OU=Personal, O=Ederson, L=Sao Paulo, ST=SP, C=BR"

SECRETS_FILE="${PROJECT_ROOT}/temp/android-keys/keystore-secrets.txt"
{
  echo "APK_KEYSTORE_PATH=${KEYSTORE_PATH}"
  echo "APK_KEY_ALIAS=${KEY_ALIAS}"
  echo "APK_KEYSTORE_PASSWORD=${STORE_PASS}"
  echo "APK_KEY_PASSWORD=${KEY_PASS}"
} > "${SECRETS_FILE}"

chmod 600 "${SECRETS_FILE}"

echo "Keystore criado com sucesso."
echo "Arquivo: ${KEYSTORE_PATH}"
echo "Credenciais salvas em: ${SECRETS_FILE}"
