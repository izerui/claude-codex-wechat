#!/usr/bin/env bash
# Operational / validation script:
# Starts the latest bridge runtime with the current WeChat credentials
# and immediately prints key runtime API snapshots.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="${BRIDGE_RUNTIME_DIR:-/tmp/bridge-runtime-check}"
PORT="${BRIDGE_PORT:-8788}"
CLAUDE_CMD="${BRIDGE_CLAUDE_COMMAND:-/Applications/cmux.app/Contents/Resources/bin/claude}"
CODEX_CMD="${BRIDGE_CODEX_COMMAND:-/opt/homebrew/bin/codex}"
DEFAULT_PROVIDER="${BRIDGE_DEFAULT_PROVIDER:-}"
WECHAT_ENV_FILE="${BRIDGE_WECHAT_CREDENTIALS_ENV:-/tmp/bridge-weixin.env}"
WECHAT_JSON_FILE="${BRIDGE_WECHAT_CREDENTIALS_JSON:-/tmp/bridge-weixin-credentials.json}"

if [[ -f "$WECHAT_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$WECHAT_ENV_FILE"
elif [[ -f "$WECHAT_JSON_FILE" ]]; then
  export BRIDGE_WECHAT_ENABLED="${BRIDGE_WECHAT_ENABLED:-$(jq -r '.wechat.enabled // true' "$WECHAT_JSON_FILE")}"
  export BRIDGE_WECHAT_BASE_URL="${BRIDGE_WECHAT_BASE_URL:-$(jq -r '.wechat.baseUrl // empty' "$WECHAT_JSON_FILE")}"
  export BRIDGE_WECHAT_TOKEN="${BRIDGE_WECHAT_TOKEN:-$(jq -r '.wechat.token // empty' "$WECHAT_JSON_FILE")}"
  export BRIDGE_WECHAT_ACCOUNT_ID="${BRIDGE_WECHAT_ACCOUNT_ID:-$(jq -r '.wechat.accountId // empty' "$WECHAT_JSON_FILE")}"
fi

WECHAT_BASE_URL="${BRIDGE_WECHAT_BASE_URL:-https://ilinkai.weixin.qq.com}"
WECHAT_ACCOUNT_ID="${BRIDGE_WECHAT_ACCOUNT_ID:-7b6cb4639d9e@im.bot}"

mkdir -p "$RUNTIME_DIR"

if [[ -z "${BRIDGE_WECHAT_TOKEN:-}" ]]; then
  echo "BRIDGE_WECHAT_TOKEN is required" >&2
  echo "hint: run 'pnpm tsx scripts/weixin-login-helper.ts' first, then retry" >&2
  exit 1
fi

export BRIDGE_PORT="$PORT"
export BRIDGE_CONFIG="$RUNTIME_DIR/config.json"
export BRIDGE_WECHAT_ENABLED="${BRIDGE_WECHAT_ENABLED:-1}"
export BRIDGE_WECHAT_BASE_URL="$WECHAT_BASE_URL"
export BRIDGE_WECHAT_TOKEN
export BRIDGE_WECHAT_ACCOUNT_ID="$WECHAT_ACCOUNT_ID"
export BRIDGE_CLAUDE_COMMAND="$CLAUDE_CMD"
export BRIDGE_CODEX_COMMAND="$CODEX_CMD"

cat > "$BRIDGE_CONFIG" <<EOF
{
  "databasePath": "$RUNTIME_DIR/bridge.sqlite",
  "providers": {
    "claude": { "command": "$CLAUDE_CMD" },
    "codex": { "command": "$CODEX_CMD" }
  }
}
EOF

cd "$ROOT_DIR"
pnpm dev &
PID=$!

cleanup() {
  kill "$PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/api/settings" >/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$DEFAULT_PROVIDER" == "claude-code" || "$DEFAULT_PROVIDER" == "codex" ]]; then
  curl -sf -X POST "http://127.0.0.1:$PORT/api/settings" \
    -H 'content-type: application/json' \
    -d "{\"defaultProvider\":\"$DEFAULT_PROVIDER\"}" >/dev/null
fi

echo "runtime started on http://127.0.0.1:$PORT"
echo
echo "--- /api/channel/plugins ---"
curl -sf "http://127.0.0.1:$PORT/api/channel/plugins" | jq .
echo
echo "--- /api/channel/wechat/runtime-config ---"
curl -sf "http://127.0.0.1:$PORT/api/channel/wechat/runtime-config" | jq .
echo
echo "--- /api/settings ---"
curl -sf "http://127.0.0.1:$PORT/api/settings" | jq .
echo
echo "--- /api/channel/sessions ---"
curl -sf "http://127.0.0.1:$PORT/api/channel/sessions" | jq .

wait "$PID"
