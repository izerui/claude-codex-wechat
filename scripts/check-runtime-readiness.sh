#!/usr/bin/env bash
# Diagnostic script:
# Checks whether the latest bridge runtime is actually ready for real WeChat traffic
# and whether Claude/Codex resume-related fields look healthy.
set -euo pipefail

PORT="${BRIDGE_PORT:-8788}"
BASE_URL="http://127.0.0.1:${PORT}"

echo "--- runtime readiness (${BASE_URL}) ---"

plugins_json="$(curl -sf "${BASE_URL}/api/channel/plugins")"
runtime_json="$(curl -sf "${BASE_URL}/api/channel/wechat/runtime-config")"
settings_json="$(curl -sf "${BASE_URL}/api/settings")"
sessions_json="$(curl -sf "${BASE_URL}/api/channel/sessions")"

echo
echo "[plugins]"
echo "$plugins_json" | jq .

echo
echo "[wechat runtime config]"
echo "$runtime_json" | jq .

echo
echo "[settings]"
echo "$settings_json" | jq .

echo
echo "[session readiness summary]"
echo "$sessions_json" | jq '[.[] | {
  id,
  providerId,
  chatId,
  providerSessionId,
  resumeTitle,
  preferredResumeMode,
  preferredResumeCommand,
  providerResumeTitleSynced,
  providerResumeHistorySynced,
  providerResumeRepairable,
  providerNativeReachable,
  status
}]'

echo
echo "[checks]"
echo "weixin_enabled=$(echo "$plugins_json" | jq -r '.[0].enabled // false')"
echo "weixin_connected=$(echo "$plugins_json" | jq -r '.[0].connected // false')"
echo "weixin_status=$(echo "$plugins_json" | jq -r '.[0].status // "unknown"')"
echo "weixin_last_error=$(echo "$plugins_json" | jq -r '.[0].lastError // ""')"
echo "weixin_has_token=$(echo "$plugins_json" | jq -r '.[0].hasToken // false')"
echo "runtime_has_account=$(echo "$runtime_json" | jq -r 'has("accountId") and (.accountId != null and .accountId != "")')"
echo "runtime_has_token=$(echo "$runtime_json" | jq -r 'has("token") and (.token != null and .token != "")')"
echo "claude_title_ready_count=$(echo "$sessions_json" | jq '[.[] | select(.providerId == "claude-code" and .preferredResumeMode == "title" and (.preferredResumeCommand // "" | startswith("claude -r "))) ] | length')"
echo "claude_history_ready_count=$(echo "$sessions_json" | jq '[.[] | select(.providerId == "claude-code" and .providerResumeHistorySynced == true)] | length')"
echo "codex_title_ready_count=$(echo "$sessions_json" | jq '[.[] | select(.providerId == "codex" and .preferredResumeMode == "title" and (.preferredResumeCommand // "" | startswith("codex exec resume --json --last "))) ] | length')"
