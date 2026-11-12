# imux Mobile Message Alignment

**Goal:** Align the native CLI bridge's mobile conversation behavior with the
local imux reference, as requested by the user.

**Design:** Keep the existing Claude stream-json and Codex app-server transports.
Use native events to track background work across turns. Deliver each turn's
conclusion, followed by one background-work hint when the task set changes.
Keep consuming native follow-up turns while the session has background work.
Questions and confirmations must reach the phone before an incoming message
can answer them. Quota recovery must not consume ordinary user input.

**Reference:** imux `bridge/core/BridgeRouter.kt`, `TabState.kt`,
`HookPrompts.kt`, and `bridge/transcript/TranscriptDecoders.kt`.

**Constraints:** Work in the main directory; preserve existing uncommitted
changes. Do not replace native transports with terminal automation or hooks.
Keep existing native permission-mode semantics and bridge commands. Switching
away discards old work; reloading the same session does not invalidate queued
input. No new dependencies.

## Tasks

- [x] Test and fix inbound delivery: quota refresh, prompt delivery receipts,
  attachments during confirmation, explicit acknowledgement, steer fallback.
- [x] Test and simplify outbound quota handling: durable FIFO, no age-based
  deletion, no interception, no withholding the last quota slot.
- [x] Test and implement native background lifecycle events and turn hints for
  Claude and Codex; consume autonomous follow-up turns, allow new input while
  waiting, and stop observing when the session is replaced.
- [x] Test and fix conclusion recovery; do not kill healthy long-running work
  by default; keep opt-in idle timeout support.
- [x] Update project behavior documentation, typecheck, run the full suite, and
  review the final changes.

## Verification Focus

Queued questions cannot accept replies sent before delivery. Switching sessions
must suppress old notifications. Background task progress is not chat output.
Foreground subagents and ambient watchers are not background-work hints.
Late completion and partial streaming must not lose the final answer.

## Decisions

The user approved imux-style message behavior in conversation. Implement directly
without worktrees or commits. imux's terminal-only UI/mode choices are not copied
into the native provider protocol. Existing permission choices remain stable.

## Validation

Full suite: 566 passed, 7 skipped. `pnpm typecheck` and `git diff --check`
passed. Native background lifecycle, early follow-up input, conclusion recovery,
delivery receipts, expired confirmations, concurrent drains, and segmented
quota delivery have regression coverage. IDE MCP checks were unavailable.
No live phone delivery or production daemon deployment was performed.
