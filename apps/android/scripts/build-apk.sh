#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-debug}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ANDROID_DIR="${APP_DIR}/android"

cd "${APP_DIR}"

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

if [[ "${MODE}" == "release" ]]; then
  npm run build:release
else
  npm run build:debug
fi
