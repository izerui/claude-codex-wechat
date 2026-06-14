#!/usr/bin/env bash
set -euo pipefail

PORT="${BRIDGE_PORT:-8788}"
BASE_URL="http://127.0.0.1:${PORT}"

echo "--- sessions summary (${BASE_URL}) ---"
curl -sf "${BASE_URL}/api/channel/sessions" | jq '[.[] | {
  id,
  chatId,
  providerId,
  providerSessionId,
  resumeTitle,
  preferredResumeMode,
  preferredResumeCommand,
  providerResumeCommand,
  providerResumeByTitleCommand,
  providerResumeTitleSynced,
  providerResumeHistorySynced,
  providerNativeReachable,
  providerNativePath,
  status
}]'
