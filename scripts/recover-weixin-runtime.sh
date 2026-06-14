#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
QR_HTML_PATH="${BRIDGE_WECHAT_QR_OUTPUT:-/tmp/bridge-weixin-login-qr.svg}"
ENV_PATH="${BRIDGE_WECHAT_CREDENTIALS_ENV:-/tmp/bridge-weixin.env}"
JSON_PATH="${BRIDGE_WECHAT_CREDENTIALS_JSON:-/tmp/bridge-weixin-credentials.json}"

cd "$ROOT_DIR"

echo "[1/3] requesting fresh weixin login qr"
echo "qr html: $QR_HTML_PATH"
echo "env out: $ENV_PATH"
echo "json out: $JSON_PATH"
echo

BRIDGE_WECHAT_QR_OUTPUT="$QR_HTML_PATH" \
BRIDGE_WECHAT_CREDENTIALS_ENV="$ENV_PATH" \
BRIDGE_WECHAT_CREDENTIALS_JSON="$JSON_PATH" \
pnpm tsx scripts/weixin-login-helper.ts

echo
echo "[2/3] credentials confirmed, starting latest runtime"
BRIDGE_WECHAT_CREDENTIALS_ENV="$ENV_PATH" \
BRIDGE_WECHAT_CREDENTIALS_JSON="$JSON_PATH" \
bash ./scripts/start-runtime-check.sh
