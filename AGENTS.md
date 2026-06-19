# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core commands

Run everything from the repo root:

```bash
cd /Users/liuyuhua/github/local-agent-wechat-bridge
```

Install dependencies:

```bash
pnpm install
```

Start the bridge daemon:

```bash
pnpm dev
```

Start the web admin UI (Vite dev server on `127.0.0.1:5177`):

```bash
pnpm web
```

Typecheck:

```bash
pnpm typecheck
```

Run all tests:

```bash
pnpm test
```

Build the web UI:

```bash
pnpm build:web
```

Run a single test file:

```bash
pnpm test tests/channelRoutes.test.ts
pnpm test tests/claudeHeadlessRunner.test.ts
pnpm test tests/web/appDashboard.test.tsx
```

Opt-in real provider probes (skip by default):

```bash
BRIDGE_REAL_CLAUDE=1 pnpm test tests/claudeRealProbe.test.ts tests/claudeHeadlessRunner.real.test.ts
BRIDGE_REAL_CODEX=1 pnpm test tests/codexRealProbe.test.ts tests/codexCliRunner.real.test.ts
```

## Configuration

Default config path:

```text
~/.local-agent-wechat-bridge/config.json
```

You can point the daemon at another config with:

```bash
export BRIDGE_CONFIG=/absolute/path/to/config.json
```

Provider command overrides can come from either config or environment:

```bash
export BRIDGE_CLAUDE_COMMAND=/opt/homebrew/bin/claude
export BRIDGE_CODEX_COMMAND=/opt/homebrew/bin/codex
```

For first-time setup, copy the example config:

```bash
cp config.example.json ~/.local-agent-wechat-bridge/config.json
```

## Big-picture architecture

This repository is a **local native-provider bridge**, not an ACP bridge. It connects an existing WeChat clawbot HTTP endpoint to native local Claude Code and Codex CLI sessions and exposes a local admin UI.

Two constraints matter:

- **Do not convert the Claude/Codex bridge path to ACP.** The purpose of this repository is to keep WeChat conversations compatible with the same native local CLI sessions a user can also interact with directly from their terminal.
- **Provider behavior should stay aligned with native local CLI semantics** (session ids, resume behavior, message flow, permission prompts), because WeChat-driven conversations are expected to interoperate with local CLI-driven conversations rather than becoming a separate protocol silo.

Implementation lineage for this repository:

- The **provider bridge side** (`src/providers/**`, `src/session/**`, `src/permissions/**`) is modeled after the way `~/github/happier` interacts with Claude Code and Codex.
- The **WeChat channel side** (`src/channels/wechat-clawbot/**`, admin pairing/revoke flows) is modeled after the WeChat clawbot / channel approach in `~/github/AionUi`.

### Main runtime flow

1. `src/main.ts` loads config, opens SQLite (if configured), and starts the Fastify daemon.
2. `src/daemon/server.ts` is the assembly root. It wires together:
   - channel routes
   - admin/settings routes
   - provider registry
   - session manager
   - message router
   - SQLite-backed repositories
3. WeChat messages enter through `src/daemon/channelRoutes.ts` (`POST /api/channel/wechat/inbound`).
4. Authorized messages are handed to `src/session/messageRouter.ts`, which is the orchestration core.
5. `MessageRouter` resolves the active bridge session, dispatches to a native provider, persists message/permission/session state, and pushes responses back through the configured channel adapter.

### Native provider model

Provider abstractions live in `src/providers/types.ts`.

The important split is:

- `src/providers/claude-code/*` — Claude Code native/headless path
- `src/providers/codex/*` — Codex native/CLI path
- `src/providers/defaultProviders.ts` — constructs the default native provider instances
- `src/providers/providerRegistry.ts` — provider detection and diagnostics for the admin UI

Each provider has three layers:

1. **Detection** (`claudeDetection.ts`, `codexDetection.ts`) — answers “is the CLI available, and what version/diagnostic state do we have?”
2. **Runner** (`claudeHeadlessRunner.ts`, `codexCliRunner.ts`) — speaks to the actual CLI and turns raw CLI output into bridge-level events
3. **Provider facade** (`claudeProvider.ts`, `codexProvider.ts`) — implements the shared `NativeProviderAdapter` contract used by the rest of the daemon

The key architectural rule is that the rest of the app talks to `NativeProviderAdapter`, not directly to CLI-specific code.

### Session / permission orchestration

`src/session/messageRouter.ts` is the highest-leverage file in the codebase. It owns the real behavior of the bridge:

- parsing chat commands (`/new`, `/stop`, `/approve`, `/deny`, etc.)
- choosing the provider
- starting provider sessions
- forwarding message events to the channel
- persisting session/message/permission state
- routing permission decisions back into the provider via `decidePermission()`

Supporting pieces:

- `src/session/sessionManager.ts` — in-memory active session state and lifecycle helpers
- `src/permissions/permissionRouter.ts` — in-memory permission decision state
- `src/permissions/formatPermissionMessage.ts` — user-facing permission text formatting

If behavior looks wrong at runtime, start by tracing through `MessageRouter`.

### Persistence model

SQLite schema is defined in `src/storage/schema.ts`.

Repositories are intentionally split by domain:

- `userRepository.ts`
- `pairingRepository.ts`
- `runtimeSessionRepository.ts`
- `permissionRequestRepository.ts`
- `messageLogRepository.ts`
- `settingsRepository.ts`

`src/storage/repositories.ts` is just a barrel export.

The important architectural idea is that the daemon has both:

- **ephemeral runtime state** (`SessionManager`, `PermissionRouter`)
- **persisted state** (repositories)

Most bridge actions update both, and regressions usually come from them drifting out of sync.

### Channel / WeChat model

The bridge assumes an existing WeChat clawbot speaks HTTP.

Relevant files:

- `src/channels/types.ts` — channel abstraction
- `src/channels/wechat-clawbot/messageMapping.ts` — map clawbot payloads to bridge messages and back
- `src/channels/wechat-clawbot/client.ts` — outbound HTTP client
- `src/channels/wechat-clawbot/adapter.ts` — adapter implementation used by the daemon

This is intentionally transport-specific to clawbot HTTP and independent from provider logic.

### Admin UI

The web UI is deliberately thin and lives under `src/web/`.

- `src/web/App.tsx` — admin shell with dashboard, sessions, permissions, settings
- `src/web/WeChatPanel.tsx` — pairing / authorized-user management
- `src/web/apiClient.ts` — all admin UI HTTP calls

Important note for development: the Vite dev server proxies `/api/*` to the local daemon. If you see HTML being parsed as JSON in the browser, the dev proxy/base URL path is the first place to inspect.

## Real-provider caveats

The repository already contains opt-in real CLI tests. Keep these principles in mind when changing provider code:

- Claude Code real behavior has already shown that `--print + --output-format stream-json` requires `--verbose`.
- Codex real behavior currently proves a **minimal contract** (successful completion and `message_done`) but not necessarily every parser assumption from fake/unit tests.
- When real CLI behavior disagrees with the fake contract, prefer updating the parser/tests to match observed reality rather than preserving a nicer-but-false abstraction.

## Resume invariants

These rules are easy to break and must be preserved when changing WeChat bridge, provider, or recovery code.

**Session continuity is the whole point: WeChat-driven turns MUST land in the same native session transcript a human resumes from the CLI — never a fork, never a different file.** This is a non-negotiable invariant; violating it breaks two-way sync between WeChat and the local Claude/Codex CLI, which is the core purpose of this bridge. Concretely, every bridge turn for a session must:

1. **Continue the native session via its real resume mechanism, not a new one.** Claude turns go through `claude -p --resume <id>` (Codex via its equivalent resume). Do NOT pass `--fork-session` and do NOT let the provider mint a new session id mid-conversation. `claude -p --resume <id>` appends to the same `<id>.jsonl` by default (confirmed via `claude --help`: `--fork-session` is the only thing that changes the id, and it is opt-in). The id you resume with must be the same id a human sees in the CLI resume picker.
2. **Run with the session's correct, stable cwd on every single turn.** Claude writes each transcript to `~/.claude/projects/<cwd-slug>/<id>.jsonl`, keyed by the cwd the process runs in. A wrong cwd makes the next message fail with `spawn ... ENOENT` (non-existent dir) or silently route the turn into a different project bucket — either way the CLI sees nothing. A cwd that changes between turns of the same session splits the conversation across files. Resolve cwd authoritatively (see the cwd rule below), and reuse the session's persisted cwd for the whole session.

Litmus test: after several WeChat turns, opening `claude --resume <id>` (or the Codex picker) in the session's real cwd must show those exact WeChat turns and Claude/Codex replies. If WeChat and the CLI ever show different histories for the same session id, this invariant has been violated.

### Claude resume invariants

For a WeChat-driven Claude session to be recoverable through `claude -r` and visible in Claude resume flows, all of the following must stay aligned:

- the bridge session must have a stable `resumeTitle`
- the native Claude session file under `~/.claude/projects/**` must contain matching `custom-title` / `agent-name`
- `~/.claude/history.jsonl` must contain both:
  - `display` equal to the same bridge title
  - `project` equal to the real session cwd

**cwd must come from an authoritative source, never from the project directory name.** A Claude session's real working directory is recorded as the `cwd` field inside the session `.jsonl` records, and is also known directly as `session.cwd` at creation/sync time. Resolve cwd in this order: the known `session.cwd` (pass it through explicitly, e.g. into `ensureClaudeSessionBridgeMetadata({ cwd })`), then the session-file `cwd` field (`readClaudeSessionMetadata`). Never decode it from the `~/.claude/projects/<name>` directory name — that encoding replaces `/` with `-` and is irreversibly ambiguous for any path segment that itself contains `-` (e.g. `claude-codex-wechat` decodes wrongly to `claude/codex/wechat`). A wrong cwd points at a non-existent directory and makes the provider fail with `spawn ... ENOENT` on the next message. Both the recoverable-session listing (`listRecoverableClaudeSessions`) and the `history.jsonl` `project` write must follow this. `tests/claudeNativeSessions.test.ts` and `tests/channelMessageFlow.test.ts` pin the behavior with hyphenated paths — do not regress them back to path-derived expectations.

Bridge-created Claude sessions also need to look like native CLI sessions closely enough for Claude's resume UI to recognize them. In practice this means:

- do not leave bridge-created Claude session records with `entrypoint: "sdk-cli"` once recovery metadata is being normalized
- ensure a `permission-mode` record exists for normalized bridge-created Claude sessions

If you touch Claude recovery behavior, validate against:

- `tests/claudeNativeSessions.test.ts`
- `tests/daemonSessionRecovery.test.ts`
- the relevant Claude recovery cases in `tests/channelAdminRoutes.test.ts`

### Codex resume invariants

For a WeChat-driven Codex session to be recoverable through Codex resume flows:

- `~/.codex/session_index.jsonl` must contain the bridge-owned `thread_name`
- provider sidecar metadata must preserve the bridge cwd and bridge tag
- bridge-created interactive Codex threads must be normalized into the same native metadata shape that `codex resume` picker recognizes as a normal CLI session, including native thread/rollout metadata that presents the session as `cli` / `codex-tui` rather than a non-interactive or editor-only source
- resume-visible Codex session titles should be human-recognizable in the picker. Prefer a stable bridge title or a recent user-facing message/title that helps a human identify the conversation quickly; do not regress titles back to opaque internal ids or low-signal metadata if the picker can instead show something the user can recognize at a glance

Do not auto-attach a recoverable Codex session whose `cwd` does not match the target user/session cwd unless there is an explicit persisted binding. Attaching the wrong native session causes resume UI cwd filtering to lie and binds WeChat traffic to the wrong historical session.

If you touch Codex recovery behavior, validate against:

- `tests/channelMessageFlow.test.ts`
- the Codex recovery and attach cases in `tests/channelAdminRoutes.test.ts`

### WeChat authorization default

`wechatAutoAuthorize` is treated as enabled by default. Runtime behavior must stay consistent with the settings API and admin UI:

- only an explicit stored value of `false` should disable automatic WeChat authorization
- do not reintroduce a mismatch where settings display defaults to enabled but runtime still requires manual pairing approval

### Current product decisions

These product decisions are intentional and should not be “fixed” back to the older multi-user admin model unless explicitly requested by the user.

- The bridge is currently scoped to a single local operator and a single WeChat user on that operator's own machine.
- WeChat authorization should auto-pass by default for this product shape. Do not restore manual pairing approval UI or pending-pairing admin workflows unless the user explicitly asks to support that mode again.
- Provider permission prompts should be decided by the WeChat user in the WeChat conversation itself. Prefer clear text instructions and replyable commands in WeChat over restoring a web-admin approval workflow.
- It is acceptable for the web admin UI to omit permission-decision controls and pairing-approval controls when the WeChat flow is the intended control surface.
- The current development setup may intentionally accept the Vite `allowedHosts` risk for local use. Do not “fix” that by default unless the user explicitly asks for the tighter host-validation posture.

## Where to look first for common changes

- Add or change chat command behavior: `src/session/commandParser.ts` and `src/session/messageRouter.ts`
- Change pairing / revoke / user lifecycle: `src/admin/channelAdminRoutes.ts`, `src/storage/userRepository.ts`, `src/storage/pairingRepository.ts`, `src/web/WeChatPanel.tsx`
- Change session admin behavior: `src/admin/channelAdminRoutes.ts`, `src/session/sessionManager.ts`, `src/storage/runtimeSessionRepository.ts`, `src/web/App.tsx`
- Change permission handling: `src/permissions/permissionRouter.ts`, `src/session/messageRouter.ts`, provider-specific permission mapping files
- Change provider diagnostics: `src/providers/providerRegistry.ts`, detection files, and Dashboard rendering in `src/web/App.tsx`
- Change WeChat HTTP compatibility: `src/channels/wechat-clawbot/*` and `src/daemon/channelRoutes.ts`

## Slash command extension rules

The bridge has an intentional slash-command extension point for WeChat text input. Preserve and extend it deliberately.

- The canonical parser lives in `src/session/commandParser.ts`. Add new bridge slash commands there first.
- `src/session/messageRouter.ts` is the execution side for parsed commands. Keep parsing and execution split; do not bury ad-hoc string matching in `MessageRouter`.
- Unknown slash commands must continue to fall back to `{ kind: 'chat', text }` unless there is an explicit product decision to reserve them. This keeps room for provider-native text commands and avoids accidental breakage.
- Prefer typed command variants in `BridgeCommand` over loosely structured payloads. When adding a command, add a distinct union member rather than overloading an existing one.
- New slash commands should be bridge-owned conversation controls, not a blind passthrough of provider TUI internals. If a provider-native slash command needs support, document whether it is:
  - parsed and handled by the bridge, or
  - intentionally passed through as normal chat text.
- Keep command names stable once exposed to WeChat users. If behavior changes, update help text and tests in the same change.
- Every new command or command syntax change must include focused tests in `tests/commandParser.test.ts` and, when behavior is non-trivial, a routing/integration test in `tests/messageRouter.test.ts` or `tests/channelMessageFlow.test.ts`.

## WeChat interaction rules

The current WeChat direct channel is text-only in practice. Do not design bridge or agent interactions that depend on buttons, cards, or structured click UI unless the transport layer is explicitly upgraded first.

- Treat WeChat as a plain-text chat surface.
- For real provider permission prompts, prefer explicit WeChat reply commands or equally direct text choices so the WeChat user can make the decision inside WeChat.
- For user choices during multi-turn conversations, prefer numbered text options that the user can reply to directly.
- Recommended pattern:
  - `1. 保守方案`
  - `2. 激进方案`
  - `3. 先解释差异`
  - Follow with a short instruction such as `回复 1 / 2 / 3 选择方案。`
- Do not route ordinary “choose a plan/option” interactions through the permission system.
- Reserve permission-style messages (`/approve`, `/deny`, `/abort`) for actual bridge/provider approval events only.
