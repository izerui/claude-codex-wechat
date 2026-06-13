# local-agent-wechat-bridge

A local bridge service that connects an existing WeChat clawbot HTTP endpoint to native local Claude Code and Codex CLI sessions.

## What it does

- Accepts inbound WeChat messages from an existing clawbot via HTTP
- Routes messages into native non-ACP Claude Code / Codex providers
- Persists sessions, permission requests, message logs, and settings in SQLite
- Provides a local admin UI for pairing, revoke, session stop/archive, permission approval, and provider status

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
- `wechat.baseUrl`
- `wechat.token`
- `providers.claude.command`
- `providers.codex.command`

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
