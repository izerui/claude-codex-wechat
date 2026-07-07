# Weak Handoff via Staleness Detection and `/reload`

## Status

Accepted design for the first phase of bidirectional session handoff. Scope is intentionally limited to weak handoff only.

## Problem

The bridge already preserves native Claude/Codex session continuity by reusing the same provider session id and cwd. That is enough for WeChat turns and local CLI turns to land in the same native transcript, but it is not enough for safe two-way control.

Today, if a user resumes the same native session from the local CLI and continues the conversation, the bridge still holds its older in-memory provider state. The next WeChat turn may try to continue from stale state. Native storage is append-oriented and does not immediately corrupt, but the runtime semantics diverge: two controllers can each believe they are continuing the same session while actually advancing from different in-memory assumptions.

For the first phase, the product does not need full lease-based takeover or forced preemption. It only needs a safe rule:

- a side may resume the same native session and continue if the bridge is not actively generating
- when the bridge later detects that its local runtime view is stale, it must refuse to send the next message until the user reloads the session state

This keeps the bridge aligned with native resume semantics without introducing a second coordination protocol prematurely.

## Goals

- Preserve the current native-session invariant: same `providerSessionId`, same `cwd`, no fork.
- Allow either side to resume the same native session while the other side is idle.
- Detect that the bridge's provider runtime state is stale before sending the next WeChat message.
- Require an explicit `/reload` to refresh stale bridge state.
- Keep `/resume`, auto-attach, and bridge restart recovery behavior intact.

## Non-Goals

- No strong lease ownership or forced handoff protocol.
- No real-time push notification that another controller has resumed the session.
- No automatic merge of concurrent branches.
- No concurrent dual-writer support.
- No attempt to normalize Claude and Codex around a synthetic turn id if the native formats do not expose one cleanly.

## User-Facing Behavior

### Normal case

If the bridge resumes a native session and the native session has not advanced elsewhere since the bridge last observed it, the next WeChat message continues normally.

### Stale case

If the native session has advanced elsewhere since the bridge last observed it, the bridge does not send the next message to the provider. Instead it replies with a status message:

`该会话已在另一端继续，当前桥接状态已过期。请先 /reload 后再继续。`

### `/reload`

`/reload` discards the bridge's stale provider runtime handle and re-attaches the bridge to the same native session using the existing `providerSessionId + cwd` binding. It does not create a new session and does not fork the native transcript.

Successful reload replies with a short status message such as:

`已重新加载当前会话，可继续对话。`

If the bridge has no active current conversation or no `providerSessionId`, `/reload` returns a normal status error and does nothing destructive.

## Product Rules

### Resume remains permissive

`/resume`, auto-attach, manual attach, and bridge restart recovery remain permissive. They may bind the bridge to an existing native session without first rejecting it as stale.

The stale check happens only when the bridge is about to send a new message into the native session.

This separation matters:

- resume answers "which native session is this bridge session attached to?"
- stale detection answers "is the bridge's provider runtime state fresh enough to write another turn safely?"

### Sending is guarded

Before `MessageRouter` calls `provider.sendMessage()`, it must compare the bridge's last seen native version against the native session's current version. If the current native version is newer, the send is blocked and the user is instructed to run `/reload`.

### Reload is explicit

The bridge does not silently refresh stale provider state on behalf of the user. The user must see that another side has advanced the session and must opt into reloading.

This keeps behavior understandable and avoids the bridge unexpectedly swapping provider handles or work directories mid-turn.

## Architecture

The design adds a provider-neutral staleness check and a provider-specific native version reader.

### 1. Persist a last-seen native fingerprint

Extend `CurrentConversationBinding` with:

- `lastSeenNativeFingerprint?: string`
- `lastReloadedAt?: number`

Optional future debugging field:

- `staleReason?: 'native_advanced_elsewhere'`

These fields live alongside the existing `providerSessionId`, `resumeTitle`, and `cwd` in the current conversation state.

### 2. Add a read-only provider capability

Extend the provider interface with a read-only method:

```ts
getNativeVersion?(input: {
  providerSessionId: string;
  cwd: string;
}): Promise<{ fingerprint: string; observedAt: number } | null>;
```

This method reports the provider's best available current native-session fingerprint. It does not mutate any provider runtime state and does not start or resume a session.

### 3. Guard message send with a freshness check

Add a helper in `MessageRouter` that runs before `provider.sendMessage()`:

1. return early if there is no `providerSessionId`
2. return early if the provider does not implement `getNativeVersion`
3. read the provider's current native fingerprint
4. compare it to `session.lastSeenNativeFingerprint`
5. if the bridge has never seen a fingerprint for this session, allow the send
6. if the fingerprint matches, allow the send
7. if the fingerprint differs, block the send and instruct the user to run `/reload`

### 4. Reload re-attaches the same native session

`/reload` does four things:

1. interrupt or recycle any stale in-memory provider process/client for the current bridge session
2. re-attach a fresh provider runtime handle to the same `providerSessionId + cwd`
3. read and persist the latest native fingerprint
4. confirm that the session is ready again

For this first phase, `/reload` stays on the existing bridge session record. It refreshes the active runtime handle; it does not intentionally create a new logical bridge session for the user-facing conversation.

## Provider-Specific Native Fingerprints

The first implementation should prefer coarse but reliable file-backed fingerprints over complicated semantic parsing.

### Claude

Use the native session `.jsonl` file behind the known Claude session id and cwd. The fingerprint should be derived from file state, not from session id.

Recommended fingerprint:

- `claude:<sessionId>:<mtimeMs>:<size>`

Rationale:

- Claude session ids are stable across resume and therefore cannot indicate progress by themselves.
- the session file's size and modification time are sufficient to detect that new records were appended elsewhere
- this is robust against short external resumes that only append a few records

If the session file cannot be found or read, return `null` rather than fabricating a value.

### Codex

Use the best stable native thread artifact available for the known Codex session/thread id. Prefer persisted thread metadata or thread storage that changes as the thread advances.

Recommended initial fingerprint:

- `codex:<sessionId>:<mtimeMs>:<size>`

Candidate sources, in priority order:

1. a stable thread/session artifact already used by resume recovery
2. native thread metadata synchronized for resume support
3. a fallback file associated with the thread if it reliably advances with new turns

The implementation should not assume that `session_index.jsonl` alone is always sufficient, because title synchronization and resume metadata updates may not correspond one-to-one with every conversational turn.

If no reliable artifact is available, return `null`.

## Freshness Semantics

### Initial binding

When the bridge first starts a new session, there may be no native fingerprint yet. After the first successful turn completes and native metadata has flushed, the bridge reads the current fingerprint and stores it.

### Attach or resume

When the bridge attaches to an existing native session, it should opportunistically read and store the current fingerprint as part of attach/reload finalization when possible. This reduces the chance of a false stale prompt on the first subsequent WeChat send.

If attach succeeds but no fingerprint can be read yet, the bridge still allows the next send. The first send after attach establishes the baseline.

### Stale detection

A session is considered stale when:

- the provider returns a non-null native fingerprint
- the current bridge session record has a non-empty `lastSeenNativeFingerprint`
- the two fingerprints differ

It is not considered stale when the provider cannot produce a fingerprint. In that case the bridge should fail open for this first version rather than blocking normal usage on incomplete observability.

## MessageRouter Changes

### New helper

Add a helper with semantics equivalent to:

```ts
private async ensureSessionFresh(session: CurrentConversationBinding): Promise<
  | { ok: true }
  | { ok: false; message: string }
>
```

This helper must be called after the target session is resolved but before `provider.sendMessage()` is started.

### Send path

In `runChatGeneration()`:

1. resolve the session as today
2. if the session already has a `providerSessionId`, run `ensureSessionFresh(session)`
3. if stale, send the `/reload` guidance message and return without calling `provider.sendMessage()`
4. otherwise continue as today

### End-of-turn persistence

After a successful turn completes, `MessageRouter` should re-read the native fingerprint and persist it on the current session record along with existing metadata updates.

The refresh should happen after the provider turn flushes, for the same reason Claude native metadata normalization already happens post-turn: the underlying native artifacts may only be fully on disk at the end of the turn.

## Slash Command Changes

Add a new bridge-owned command:

- `/reload`

Parsing belongs in `src/session/commandParser.ts`. Execution belongs in `src/session/messageRouter.ts`.

Unknown slash commands must continue to fall back to normal chat text.

`/reload` behavior:

- if there is no active current conversation, reply `No active session`
- if there is an active conversation but no `providerSessionId`, reply that the current session has not started a native provider session yet
- otherwise recycle the provider runtime handle, re-attach the same native session, refresh fingerprint, update `lastReloadedAt`, and confirm success

## State Transition Examples

### WeChat continues after local CLI stayed idle

1. WeChat starts or resumes session `S`
2. bridge records fingerprint `F1`
3. local CLI does nothing
4. WeChat sends another message
5. native fingerprint is still `F1`
6. bridge allows send and later records `F2`

### Local CLI advanced the native session

1. WeChat resumes session `S`
2. bridge records fingerprint `F1`
3. local CLI resumes `S` and completes more turns
4. native fingerprint becomes `F2`
5. WeChat sends another message
6. bridge sees `F2 != F1`
7. bridge blocks send and replies with `/reload` guidance
8. user replies `/reload`
9. bridge re-attaches `S`, stores `F2`
10. next WeChat message proceeds normally

### Missing observability

1. bridge attaches to a session
2. provider cannot read a native fingerprint yet
3. bridge allows send
4. after turn completion, if the fingerprint becomes readable, it stores the first observed baseline

## Error Handling

- If freshness check fails because the provider throws unexpectedly, surface a normal provider status error rather than mislabeling the session stale.
- If `/reload` cannot re-attach the native session, keep the current session binding unchanged and return a status error.
- If fingerprint refresh after a successful turn fails, keep the turn result and continue. Missing fingerprint persistence should degrade stale detection quality, not break the user's completed turn.
- If a stale session is detected during a command that changes the current conversation, the command semantics win. Stale detection only guards chat sends.

## Testing

### Unit tests

Add tests for:

- command parser support for `/reload`
- stale session blocks send and emits the `/reload` guidance message
- matching fingerprint allows send
- missing fingerprint does not block send
- `/reload` with no active session returns a status message
- `/reload` re-attaches the same `providerSessionId` instead of creating a new native session

### Integration tests

Add or extend tests for:

- WeChat session resumes normally when no external native progress happened
- WeChat session is blocked after local/native progress advances the session elsewhere
- `/reload` restores the ability to continue from WeChat
- existing `/resume`, auto-attach, and bridge restart recovery flows still work

### Provider tests

Add focused tests for:

- Claude native fingerprint derivation from session storage
- Codex native fingerprint derivation from the chosen native artifact
- provider returns `null` when the native artifact is unavailable instead of inventing stale data

## Trade-Offs

### Why this design first

This is the smallest design that prevents stale bridge writes without inventing a cross-surface locking protocol. It matches the user's expected rule:

- if the session is resumed elsewhere and then reused here, just continue when state is still fresh
- if another side has already advanced the native session, require `/reload`

### Why not lease ownership now

A lease or `/handoff` protocol is stronger, but it adds a new control model, new failure modes, and a new UX surface. The project does not need that to solve the immediate safety problem.

### Why not automatically reload

Automatic reload hides an important fact from the user: another controller has already advanced the session. Explicit `/reload` keeps the system legible and makes unexpected context changes visible.

## Implementation Notes

- Keep the stale check provider-neutral in `MessageRouter`.
- Keep native fingerprint derivation provider-specific.
- Do not derive Claude cwd from project directory naming; continue using the authoritative cwd sources already required by the repository's resume invariants.
- Do not relax the existing global session lock or interrupt invariants.
- Do not let `/reload` create a forked native session or mutate the bound cwd.

## Future Extensions

This design intentionally leaves room for a later strong-handoff phase:

- explicit `controller` or lease ownership
- `/handoff wechat|local`
- proactive "session advanced elsewhere" notifications
- admin UI indicators that the current bridge runtime is stale

Those should build on the same native fingerprint abstraction rather than replace it.
