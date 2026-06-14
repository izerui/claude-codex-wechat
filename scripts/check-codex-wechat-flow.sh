#!/usr/bin/env bash
# Codex-focused validation script:
# Waits for a Codex-backed bridge session from WeChat, then prints the session
# and tries the recommended native Codex resume command.
set -euo pipefail

PORT="${BRIDGE_PORT:-8788}"
BASE_URL="http://127.0.0.1:${PORT}"
WAIT_SECONDS="${WAIT_SECONDS:-60}"
RESUME_PROMPT="${RESUME_PROMPT:-Reply with exactly: codex-resume-ok}"

deadline=$(( $(date +%s) + WAIT_SECONDS ))
session_json=""

echo "--- waiting for codex bridge session (${BASE_URL}) ---"

while [[ $(date +%s) -lt $deadline ]]; do
  session_json="$(curl -sf "${BASE_URL}/api/channel/sessions" | jq -c '[.[] | select(.providerId == "codex" and (.archivedAt | not))] | first // empty')"
  if [[ -n "$session_json" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$session_json" ]]; then
  echo "no active codex bridge session found within ${WAIT_SECONDS}s" >&2
  exit 1
fi

echo
echo "[codex session]"
echo "$session_json" | jq .

preferred_command="$(echo "$session_json" | jq -r '.preferredResumeCommand // empty')"
provider_session_id="$(echo "$session_json" | jq -r '.providerSessionId // empty')"
resume_title="$(echo "$session_json" | jq -r '.resumeTitle // empty')"

echo
echo "[resume fields]"
echo "providerSessionId=${provider_session_id}"
echo "resumeTitle=${resume_title}"
echo "preferredResumeCommand=${preferred_command}"

if [[ -z "$preferred_command" ]]; then
  echo "preferredResumeCommand missing" >&2
  exit 1
fi

echo
echo "[codex resume probe]"
codex exec resume --json --last "$resume_title" "$RESUME_PROMPT"
