# local-agent-wechat-bridge

A local bridge service that connects a WeChat channel to native local Claude Code and Codex CLI sessions.

## What it does

- Logs into the WeChat channel through the AionCore/OpenClaw-style direct flow
- Routes WeChat messages into native non-ACP Claude Code / Codex providers
- Persists sessions, permission requests, message logs, and settings in SQLite
- Provides a local admin UI for pairing, revoke, session stop/archive, permission approval, provider status, and WeChat channel login
- Supports native provider session recovery, attach, and auto-attach for WeChat conversations

## Current alignment status

The project is already aligned on the major WeChat channel path:

- Direct WeChat login via OpenClaw/AionCore-style flow
- Native local Claude Code / Codex execution
- Session persistence and provider session resume
- Recoverable native provider session scanning
- Manual attach and auto-attach from the admin UI
- Runtime auto-attach on the first authorized WeChat message
- Persistent local binding between WeChat chat and provider session
- Recovery source observability in the admin UI: sidecar, historical binding, manual attach, heuristic recovery, and runtime-created sessions
- Claude sessions now expose both resume-by-id and resume-by-full-title commands when the native title is bridge-owned
- Codex sessions now expose resume-by-thread-name commands, and bridge-owned thread names are written back into `~/.codex/session_index.jsonl`
- Claude bridge sessions and recoverable native sessions now expose native resume repair state: synced / repairable / non-repairable
- Legacy Claude native sessions can be repaired from the admin UI before or after attach
- Attached Claude bridge sessions support both per-session and batch native resume repair
- Recoverable Claude native sessions support batch native resume repair for personal-use cleanup

What is still not fully symmetrical yet:

- The bridge can now recover and auto-attach native Claude/Codex sessions with high confidence
- But the native provider side still does not expose a fully authoritative bridge-owned binding marker that can be stably written and read back in every case
- So the remaining gap is the last step from "high-confidence automatic recovery" to "fully deterministic two-way symmetry"

## Native resume repair

For personal use, the admin UI now supports three levels of Claude native resume healing:

- daemon-start automatic healing for persisted bridge sessions
- per-session and batch repair for attached bridge sessions
- per-session and batch repair for recoverable native Claude sessions before attach

This is specifically aimed at making `claude -r <full bridge title>` viable even for older sessions that were created before the title metadata path was fully aligned.

For Claude, "title aligned" now means two separate things are both true:

- the native session file contains the bridge title metadata
- `~/.claude/history.jsonl` also exposes the same bridge title as the session `display`

Without the second condition, the bridge may still chat normally while `claude -r '<full bridge title>'` remains undiscoverable.

## Quick start

```bash
cd /Users/liuyuhua/github/local-agent-wechat-bridge
pnpm install
pnpm dev
pnpm web
```

## Verify

```bash
pnpm typecheck
pnpm test
pnpm build:web
```

## Config

Default config path:

```text
~/.local-agent-wechat-bridge/config.json
```

Create it from the example:

```bash
cp config.example.json ~/.local-agent-wechat-bridge/config.json
```

Key fields:

- `databasePath`
- `wechat.enabled`
- `wechat.mode`
- `wechat.baseUrl`
- `wechat.token`
- `wechat.accountId`
- `providers.claude.command`
- `providers.codex.command`

Equivalent environment overrides are also supported for runtime handoff:

- `BRIDGE_WECHAT_ENABLED`
- `BRIDGE_WECHAT_BASE_URL`
- `BRIDGE_WECHAT_TOKEN`
- `BRIDGE_WECHAT_ACCOUNT_ID`
- `BRIDGE_CLAUDE_COMMAND`
- `BRIDGE_CODEX_COMMAND`

For real cutover checks with the latest worktree:

```bash
BRIDGE_WECHAT_TOKEN='<real-token>' ./scripts/start-runtime-check.sh
```

If you just completed `pnpm tsx scripts/weixin-login-helper.ts` and it wrote:

- `/tmp/bridge-weixin.env`
- `/tmp/bridge-weixin-credentials.json`

then `scripts/start-runtime-check.sh` will auto-load them and you can simply run:

```bash
bash ./scripts/start-runtime-check.sh
```

Or use the one-shot recovery flow:

```bash
bash ./scripts/recover-weixin-runtime.sh
```

It will:

- fetch a fresh WeChat login QR
- wait for scan confirmation
- write `/tmp/bridge-weixin.env` and `/tmp/bridge-weixin-credentials.json`
- start the latest runtime with those credentials

Then inspect runtime readiness:

```bash
BRIDGE_PORT=8788 ./scripts/check-runtime-readiness.sh
```

For Claude title-based resume, make sure both of these are true in the session output:

- `providerResumeTitleSynced = true`
- `providerResumeHistorySynced = true`

## Real provider probes

Claude:

```bash
BRIDGE_REAL_CLAUDE=1 pnpm test tests/claudeRealProbe.test.ts tests/claudeHeadlessRunner.real.test.ts
```

Codex:

```bash
BRIDGE_REAL_CODEX=1 pnpm test tests/codexRealProbe.test.ts tests/codexCliRunner.real.test.ts
```

## Docs

See `docs/README.md` for the detailed runbook.
