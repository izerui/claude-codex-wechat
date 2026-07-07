# Weak Handoff Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weak bidirectional handoff safety by detecting when a native Claude/Codex session advanced elsewhere, blocking stale WeChat sends, and restoring the bridge with `/reload`.

**Architecture:** Keep the existing `providerSessionId + cwd` binding model and add a provider-neutral freshness check in `MessageRouter`. Providers expose a read-only native fingerprint lookup, the current conversation persists the last seen fingerprint, and `/reload` refreshes the runtime handle without creating a new native session.

**Tech Stack:** TypeScript, Vitest, Fastify-side session orchestration, native Claude/Codex session metadata readers

---

## File Map

- Modify: `src/providers/types.ts`
  - Add `getNativeVersion()` capability and `NativeVersionStamp` type.
- Modify: `src/session/currentConversationStore.ts`
  - Persist `lastSeenNativeFingerprint`, `lastReloadedAt`, and optional stale reason.
- Modify: `src/session/sessionManager.ts`
  - Allow updating the new current-conversation fields through existing helper methods if needed.
- Modify: `src/session/commandParser.ts`
  - Add `/reload` command parsing.
- Modify: `src/session/messageRouter.ts`
  - Add send-time freshness check, fingerprint persistence, and `/reload` handling.
- Modify: `src/providers/claude-code/nativeSessions.ts`
  - Add Claude native fingerprint lookup using session file stat.
- Modify: `src/providers/claude-code/claudeProvider.ts`
  - Surface the Claude native fingerprint lookup through provider interface.
- Modify: `src/providers/codex/nativeSessions.ts`
  - Add Codex native fingerprint lookup using rollout/session artifact stat.
- Modify: `src/providers/codex/codexProvider.ts`
  - Surface the Codex native fingerprint lookup through provider interface.
- Modify: `src/providers/fake/fakeProviderAdapter.ts`
  - Implement the expanded interface in a minimal test-friendly way.
- Test: `tests/commandParser.test.ts`
  - Cover `/reload`.
- Test: `tests/messageRouter.test.ts`
  - Cover stale-send blocking, permissive send when fresh, missing fingerprint fallback, and `/reload`.
- Test: `tests/claudeNativeSessions.test.ts`
  - Cover Claude fingerprint derivation.
- Test: `tests/codexNativeThreads.test.ts` or new `tests/codexNativeSessions.test.ts`
  - Cover Codex fingerprint derivation.
- Test: `tests/channelMessageFlow.test.ts`
  - Cover a bridge session becoming stale after native-side progress and recovering with `/reload`.

### Task 1: Add command and session-state plumbing

**Files:**
- Modify: `src/session/commandParser.ts`
- Modify: `src/session/currentConversationStore.ts`
- Modify: `src/session/sessionManager.ts`
- Test: `tests/commandParser.test.ts`

- [ ] **Step 1: Write the failing parser test for `/reload`**

```ts
it('parses /reload as a bridge-owned reload command', () => {
  expect(parseBridgeCommand('/reload')).toEqual({ kind: 'reload_session' });
});
```

- [ ] **Step 2: Run the parser test to verify it fails**

Run: `pnpm test tests/commandParser.test.ts -t "parses /reload as a bridge-owned reload command"`

Expected: FAIL because `parseBridgeCommand('/reload')` currently returns `{ kind: 'chat', text: '/reload' }`.

- [ ] **Step 3: Update the command union and parser**

```ts
export type BridgeCommand =
  | { kind: 'help' }
  | { kind: 'status' }
  | { kind: 'new_session'; providerId: ProviderId | null; cwd: string | null }
  | { kind: 'list_sessions'; scope: 'all'; keyword: string | null; page: number }
  | { kind: 'resume_session'; ref: string }
  | { kind: 'reload_session' }
  | { kind: 'cancel_generation' }
  | { kind: 'chat'; text: string };

// ...

if (command === '/reload') return { kind: 'reload_session' };
```

- [ ] **Step 4: Extend current conversation state for freshness metadata**

```ts
export type CurrentConversationBinding = {
  id: string;
  chatId: string;
  ownerUserId: string;
  providerId: ProviderId;
  providerSessionId?: string;
  recoverySource: 'runtime' | 'manual_attach' | 'binding_table' | 'sidecar' | 'heuristic';
  resumeTitle?: string;
  cwd: string;
  status: ProviderSessionStatus;
  lastSeenNativeFingerprint?: string;
  lastReloadedAt?: number;
  staleReason?: 'native_advanced_elsewhere';
  createdAt: number;
  lastActivityAt: number;
};
```

Also widen `CurrentConversationStore.update()` to allow:

```ts
patch: Partial<Pick<
  CurrentConversationBinding,
  'chatId' | 'providerId' | 'providerSessionId' | 'resumeTitle' | 'cwd' | 'status' |
  'lastActivityAt' | 'recoverySource' | 'lastSeenNativeFingerprint' | 'lastReloadedAt' | 'staleReason'
>>
```

- [ ] **Step 5: Run the parser test again**

Run: `pnpm test tests/commandParser.test.ts -t "parses /reload as a bridge-owned reload command"`

Expected: PASS

- [ ] **Step 6: Run the full parser suite**

Run: `pnpm test tests/commandParser.test.ts`

Expected: PASS, including existing `/resume`, `/new`, `/stop`, and `/sessions` cases.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/session/commandParser.ts src/session/currentConversationStore.ts src/session/sessionManager.ts tests/commandParser.test.ts
git commit -m "feat: add reload command and freshness session fields"
```

### Task 2: Add provider-native fingerprint capability

**Files:**
- Modify: `src/providers/types.ts`
- Modify: `src/providers/claude-code/nativeSessions.ts`
- Modify: `src/providers/claude-code/claudeProvider.ts`
- Modify: `src/providers/codex/nativeSessions.ts`
- Modify: `src/providers/codex/codexProvider.ts`
- Modify: `src/providers/fake/fakeProviderAdapter.ts`
- Test: `tests/claudeNativeSessions.test.ts`
- Test: `tests/codexNativeThreads.test.ts` or `tests/codexNativeSessions.test.ts`

- [ ] **Step 1: Write the failing Claude fingerprint test**

Add a focused test like:

```ts
it('returns a Claude native fingerprint from the recoverable session file', async () => {
  const env = createClaudeTestEnv();
  const projectDir = join(env.home, '.claude', 'projects', 'proj-a');
  await mkdir(projectDir, { recursive: true });
  const sessionPath = join(projectDir, 'claude-session-1.jsonl');
  await writeFile(sessionPath, '{"type":"user","cwd":"/tmp/proj"}\n', 'utf8');

  const stamp = await getClaudeNativeVersion({
    sessionId: 'claude-session-1',
    cwd: '/tmp/proj',
    env: env.processEnv,
  });

  expect(stamp?.fingerprint).toMatch(/^claude:claude-session-1:\d+:\d+$/);
});
```

- [ ] **Step 2: Write the failing Codex fingerprint test**

Add a focused test like:

```ts
it('returns a Codex native fingerprint from the rollout file', async () => {
  const env = createCodexTestEnv();
  const sessionDir = join(env.home, '.codex', 'sessions', '2026', '07', '07');
  await mkdir(sessionDir, { recursive: true });
  const rolloutPath = join(sessionDir, 'rollout-2026-07-07T10-00-00-codex-session-1.jsonl');
  await writeFile(rolloutPath, '{"cwd":"/tmp/codex"}\n', 'utf8');

  const stamp = await getCodexNativeVersion({
    sessionId: 'codex-session-1',
    cwd: '/tmp/codex',
    env: env.processEnv,
  });

  expect(stamp?.fingerprint).toMatch(/^codex:codex-session-1:\d+:\d+$/);
});
```

- [ ] **Step 3: Run the new provider tests to verify they fail**

Run: `pnpm test tests/claudeNativeSessions.test.ts tests/codexNativeThreads.test.ts`

Expected: FAIL because no native fingerprint helpers exist yet.

- [ ] **Step 4: Add the provider interface capability**

Update `src/providers/types.ts`:

```ts
export type NativeVersionStamp = {
  fingerprint: string;
  observedAt: number;
};

export interface NativeProviderAdapter {
  id: ProviderId;
  startSession(input: {
    bridgeSessionId: string;
    cwd: string;
    initialPrompt?: string;
    options?: Record<string, unknown> & {
      providerSessionId?: string;
      sessionName?: string;
    };
  }): Promise<ProviderSession>;
  sendMessage(input: {
    bridgeSessionId: string;
    text: string;
    attachments?: Array<{ localPath: string; mimeType?: string }>;
  }): AsyncIterable<ProviderEvent>;
  stopSession(bridgeSessionId: string): Promise<void>;
  getNativeVersion?(input: {
    providerSessionId: string;
    cwd: string;
  }): Promise<NativeVersionStamp | null>;
  listRecoverableSessions?(): Promise<ProviderSessionCandidate[]>;
  // ...
}
```

- [ ] **Step 5: Implement Claude fingerprint lookup**

Add to `src/providers/claude-code/nativeSessions.ts`:

```ts
export async function getClaudeNativeVersion(input: {
  sessionId: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<NativeVersionStamp | null> {
  const sessionPath = await findRecoverableClaudeSessionPath(input.sessionId, input.env ?? process.env);
  if (!sessionPath) return null;
  const metadata = await stat(sessionPath).catch(() => null);
  if (!metadata?.isFile()) return null;
  return {
    fingerprint: `claude:${input.sessionId}:${Math.trunc(metadata.mtimeMs)}:${metadata.size}`,
    observedAt: Date.now(),
  };
}
```

Wire it in `src/providers/claude-code/claudeProvider.ts`:

```ts
import { getClaudeNativeVersion, listRecoverableClaudeSessions } from './nativeSessions';

async getNativeVersion(input: { providerSessionId: string; cwd: string }) {
  return await getClaudeNativeVersion({
    sessionId: input.providerSessionId,
    cwd: input.cwd,
  });
}
```

- [ ] **Step 6: Implement Codex fingerprint lookup**

Add to `src/providers/codex/nativeSessions.ts`:

```ts
export async function getCodexNativeVersion(input: {
  sessionId: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<NativeVersionStamp | null> {
  const sessionPath = await findRecoverableCodexSessionPath(input.sessionId, input.env ?? process.env);
  if (!sessionPath) return null;
  const metadata = await stat(sessionPath).catch(() => null);
  if (!metadata?.isFile()) return null;
  return {
    fingerprint: `codex:${input.sessionId}:${Math.trunc(metadata.mtimeMs)}:${metadata.size}`,
    observedAt: Date.now(),
  };
}
```

Wire it in `src/providers/codex/codexProvider.ts`:

```ts
import { getCodexNativeVersion, listRecoverableCodexSessions } from './nativeSessions';

async getNativeVersion(input: { providerSessionId: string; cwd: string }) {
  return await getCodexNativeVersion({
    sessionId: input.providerSessionId,
    cwd: input.cwd,
  });
}
```

For `src/providers/fake/fakeProviderAdapter.ts`, implement the interface minimally:

```ts
async getNativeVersion(): Promise<null> {
  return null;
}
```

- [ ] **Step 7: Run the provider tests again**

Run: `pnpm test tests/claudeNativeSessions.test.ts tests/codexNativeThreads.test.ts`

Expected: PASS, with fingerprints derived from file stat and `null` behavior covered when files are missing.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/providers/types.ts src/providers/claude-code/nativeSessions.ts src/providers/claude-code/claudeProvider.ts src/providers/codex/nativeSessions.ts src/providers/codex/codexProvider.ts src/providers/fake/fakeProviderAdapter.ts tests/claudeNativeSessions.test.ts tests/codexNativeThreads.test.ts
git commit -m "feat: add native session fingerprint lookup"
```

### Task 3: Guard sends when the bridge session is stale

**Files:**
- Modify: `src/session/messageRouter.ts`
- Test: `tests/messageRouter.test.ts`

- [ ] **Step 1: Write the failing stale-send test**

Add a provider stub that reports a newer fingerprint than the current conversation:

```ts
it('blocks a chat send when the native session advanced elsewhere', async () => {
  class StaleAwareProvider implements NativeProviderAdapter {
    readonly id = 'claude-code' as const;
    readonly sent: string[] = [];
    async startSession(input: { bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
      return {
        bridgeSessionId: input.bridgeSessionId,
        providerId: this.id,
        providerSessionId: 'claude-stale-1',
        cwd: input.cwd,
        status: 'idle',
      };
    }
    async getNativeVersion() {
      return { fingerprint: 'claude:claude-stale-1:200:20', observedAt: Date.now() };
    }
    async *sendMessage(input: { bridgeSessionId: string; text: string }): AsyncIterable<ProviderEvent> {
      this.sent.push(input.text);
      yield { type: 'text_delta', text: input.text };
      yield { type: 'message_done' };
    }
    async stopSession(): Promise<void> {}
  }

  const provider = new StaleAwareProvider();
  const channel = new MockChannelAdapter();
  const conversation = new CurrentConversationStore(createRuntimeUserStore('stale-').configPath, {
    defaultCwd: '/tmp/project',
    defaultProviderId: 'claude-code',
  });
  conversation.create({
    chatId: 'chat-a',
    ownerUserId: authorizedUser.id,
    providerId: 'claude-code',
    cwd: '/tmp/project',
    resumeTitle: 'stale session',
  });
  conversation.update({
    providerSessionId: 'claude-stale-1',
    status: 'idle',
    lastSeenNativeFingerprint: 'claude:claude-stale-1:100:10',
  });

  const router = new MessageRouter({
    channel,
    providers: [provider],
    conversation,
    resolveUser: () => authorizedUser,
  });

  await router.handleMessage({
    id: 'm1',
    platform: 'weixin',
    chatId: 'chat-a',
    user: { id: 'wx_user_1' },
    content: { type: 'text', text: '继续' },
    timestamp: 1,
  });

  expect(provider.sent).toEqual([]);
  expect(channel.sent.at(-1)?.text).toContain('/reload');
});
```

- [ ] **Step 2: Write the failing non-stale and fail-open tests**

Add:

```ts
it('allows send when the native fingerprint matches', async () => {
  // provider returns the same fingerprint as lastSeenNativeFingerprint
});

it('allows send when provider cannot read a native fingerprint', async () => {
  // provider getNativeVersion returns null
});
```

Use concrete assertions:

```ts
expect(provider.sent).toEqual(['继续']);
expect(channel.sent.at(-1)?.text).toContain('收到：继续');
```

- [ ] **Step 3: Run the targeted MessageRouter tests to verify they fail**

Run: `pnpm test tests/messageRouter.test.ts -t "native session advanced elsewhere|native fingerprint matches|cannot read a native fingerprint"`

Expected: FAIL because `MessageRouter` currently never checks freshness before `sendMessage()`.

- [ ] **Step 4: Add a freshness helper to `MessageRouter`**

Implement a helper with this shape:

```ts
private async ensureSessionFresh(
  session: CurrentConversationBinding,
  provider: NativeProviderAdapter,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!session.providerSessionId) return { ok: true };
  if (!provider.getNativeVersion) return { ok: true };
  const version = await provider.getNativeVersion({
    providerSessionId: session.providerSessionId,
    cwd: session.cwd,
  });
  if (!version) return { ok: true };
  if (!session.lastSeenNativeFingerprint) return { ok: true };
  if (version.fingerprint === session.lastSeenNativeFingerprint) return { ok: true };
  this.conversation.update({
    staleReason: 'native_advanced_elsewhere',
    lastActivityAt: Date.now(),
  }, session.id);
  return {
    ok: false,
    message: '该会话已在另一端继续，当前桥接状态已过期。请先 /reload 后再继续。',
  };
}
```

- [ ] **Step 5: Call the helper before `provider.sendMessage()`**

In `runChatGeneration()` after the provider is resolved and before starting iteration:

```ts
const freshness = await this.ensureSessionFresh(session, provider);
if (!freshness.ok) {
  await this.sendToChat({ chatId: message.chatId, kind: 'status', text: freshness.message });
  return;
}
```

- [ ] **Step 6: Persist the latest fingerprint after a successful turn**

Add a helper:

```ts
private async refreshNativeFingerprint(
  session: CurrentConversationBinding,
  provider: NativeProviderAdapter,
): Promise<void> {
  if (!session.providerSessionId || !provider.getNativeVersion) return;
  const version = await provider.getNativeVersion({
    providerSessionId: session.providerSessionId,
    cwd: session.cwd,
  }).catch(() => null);
  if (!version) return;
  this.conversation.update({
    lastSeenNativeFingerprint: version.fingerprint,
    staleReason: undefined,
    lastActivityAt: Date.now(),
  }, session.id);
}
```

Call it in the same post-turn section that already re-persists native metadata:

```ts
if (finalBinding?.id === session.id && finalBinding.providerSessionId) {
  await this.refreshNativeFingerprint(finalBinding, provider).catch(() => undefined);
  await this.persistBridgeMetadata(finalBinding).catch(() => undefined);
}
```

- [ ] **Step 7: Run the targeted MessageRouter tests again**

Run: `pnpm test tests/messageRouter.test.ts -t "native session advanced elsewhere|native fingerprint matches|cannot read a native fingerprint"`

Expected: PASS

- [ ] **Step 8: Run the full MessageRouter suite**

Run: `pnpm test tests/messageRouter.test.ts`

Expected: PASS with no regressions in `/new`, `/resume`, `/stop`, choice prompts, or auto-attach sequencing.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/session/messageRouter.ts tests/messageRouter.test.ts
git commit -m "feat: block stale bridge sends before provider execution"
```

### Task 4: Implement `/reload` re-attach behavior

**Files:**
- Modify: `src/session/messageRouter.ts`
- Test: `tests/messageRouter.test.ts`

- [ ] **Step 1: Write the failing `/reload` behavior tests**

Add:

```ts
it('reloads the current session by re-attaching the same native provider session', async () => {
  class ReloadableProvider implements NativeProviderAdapter {
    readonly id = 'claude-code' as const;
    readonly attached: string[] = [];
    async startSession(input: { bridgeSessionId: string; cwd: string; options?: Record<string, unknown> }): Promise<ProviderSession> {
      return {
        bridgeSessionId: input.bridgeSessionId,
        providerId: this.id,
        providerSessionId: typeof input.options?.providerSessionId === 'string'
          ? input.options.providerSessionId
          : 'claude-reload-1',
        cwd: input.cwd,
        status: 'idle',
      };
    }
    async attachSession(input: { candidateId: string; bridgeSessionId: string; cwd: string }): Promise<ProviderSession> {
      this.attached.push(input.candidateId);
      return {
        bridgeSessionId: input.bridgeSessionId,
        providerId: this.id,
        providerSessionId: input.candidateId,
        cwd: input.cwd,
        status: 'idle',
      };
    }
    async getNativeVersion() {
      return { fingerprint: 'claude:claude-reload-1:300:30', observedAt: Date.now() };
    }
    async *sendMessage(): AsyncIterable<ProviderEvent> {}
    async stopSession(): Promise<void> {}
  }

  // arrange conversation with providerSessionId 'claude-reload-1'
  // send '/reload'
  // assert provider.attached === ['claude-reload-1']
  // assert conversation.getCurrent()?.lastSeenNativeFingerprint === 'claude:claude-reload-1:300:30'
});
```

Also add:

```ts
it('returns a status message when /reload has no active session', async () => {
  expect(channel.sent.at(-1)?.text).toContain('No active session');
});
```

- [ ] **Step 2: Run the targeted `/reload` tests to verify they fail**

Run: `pnpm test tests/messageRouter.test.ts -t "reloads the current session|/reload has no active session"`

Expected: FAIL because `/reload` is parsed but not executed.

- [ ] **Step 3: Implement `/reload` in `handleCommand()`**

Add a branch with behavior equivalent to:

```ts
if (command.kind === 'reload_session') {
  this.pendingChoices.delete(chatId);
  const current = this.conversation.getCurrent();
  if (!current) {
    await this.sendToChat({ chatId, kind: 'status', text: 'No active session' });
    return;
  }
  if (!current.providerSessionId) {
    await this.sendToChat({ chatId, kind: 'status', text: '当前会话还没有原生 provider 会话可重载' });
    return;
  }
  const provider = this.providers.get(current.providerId);
  if (!provider?.attachSession) {
    await this.sendToChat({ chatId, kind: 'status', text: `当前 provider（${current.providerId}）不支持会话重载` });
    return;
  }

  await this.preemptActiveGeneration(chatId);
  this.recycleProviderProcess(current);
  const reattached = await provider.attachSession({
    candidateId: current.providerSessionId,
    bridgeSessionId: current.id,
    cwd: current.cwd,
  });

  const version = await provider.getNativeVersion?.({
    providerSessionId: reattached.providerSessionId ?? current.providerSessionId,
    cwd: current.cwd,
  }).catch(() => null);

  this.conversation.update({
    providerSessionId: reattached.providerSessionId ?? current.providerSessionId,
    status: reattached.status,
    lastSeenNativeFingerprint: version?.fingerprint,
    lastReloadedAt: Date.now(),
    staleReason: undefined,
    lastActivityAt: Date.now(),
  }, current.id);

  await this.sendToChat({ chatId, kind: 'status', text: '已重新加载当前会话，可继续对话。' });
  return;
}
```

- [ ] **Step 4: Run the targeted `/reload` tests again**

Run: `pnpm test tests/messageRouter.test.ts -t "reloads the current session|/reload has no active session"`

Expected: PASS

- [ ] **Step 5: Run the full MessageRouter suite**

Run: `pnpm test tests/messageRouter.test.ts`

Expected: PASS, including reload and stale-send coverage from Task 3.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/session/messageRouter.ts tests/messageRouter.test.ts
git commit -m "feat: reload stale native sessions in place"
```

### Task 5: Cover end-to-end stale detection and reload recovery

**Files:**
- Modify: `tests/channelMessageFlow.test.ts`
- Optional Modify: helper fixtures under `tests/helpers/**` if needed

- [ ] **Step 1: Write the failing end-to-end stale-flow test**

Add a flow test that:

```ts
it('requires /reload after the native session advances elsewhere and then resumes normally', async () => {
  // 1. Start a WeChat conversation bound to an existing native session.
  // 2. Establish baseline fingerprint F1.
  // 3. Mutate the native session artifact to simulate local CLI progress, producing F2.
  // 4. Send a WeChat chat message and assert the bridge replies with the stale '/reload' guidance.
  // 5. Send '/reload' and assert the bridge confirms reload.
  // 6. Send another chat message and assert it now reaches the provider.
});
```

Concrete assertion examples:

```ts
expect(outboundTexts).toContain('该会话已在另一端继续，当前桥接状态已过期。请先 /reload 后再继续。');
expect(outboundTexts).toContain('已重新加载当前会话，可继续对话。');
expect(outboundTexts).toContain('收到：reload 后继续');
```

- [ ] **Step 2: Run the targeted integration test to verify it fails**

Run: `pnpm test tests/channelMessageFlow.test.ts -t "requires /reload after the native session advances elsewhere"`

Expected: FAIL before all code paths are wired together.

- [ ] **Step 3: Adjust integration fixtures only if the test exposes a real gap**

If the stale-flow test needs a reusable native-artifact mutation helper, add a tiny helper rather than duplicating file-stat mutation logic:

```ts
async function bumpNativeSessionFile(path: string): Promise<void> {
  const current = await readFile(path, 'utf8');
  await writeFile(path, `${current}{"type":"assistant","text":"external progress"}\n`, 'utf8');
}
```

Use it from the test rather than embedding repeated `writeFile()` sequences.

- [ ] **Step 4: Run the targeted integration test again**

Run: `pnpm test tests/channelMessageFlow.test.ts -t "requires /reload after the native session advances elsewhere"`

Expected: PASS

- [ ] **Step 5: Run the full regression set for this feature**

Run:

```bash
pnpm test tests/commandParser.test.ts tests/messageRouter.test.ts tests/claudeNativeSessions.test.ts tests/codexNativeThreads.test.ts tests/channelMessageFlow.test.ts
```

Expected: PASS

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS

- [ ] **Step 7: Commit Task 5**

```bash
git add tests/channelMessageFlow.test.ts tests/helpers
git commit -m "test: cover weak handoff stale reload flow"
```

## Self-Review

- Spec coverage:
  - `/reload` command: Task 1 and Task 4
  - persisted `lastSeenNativeFingerprint`: Task 1 and Task 3
  - provider-native fingerprint readers: Task 2
  - stale-send blocking: Task 3
  - explicit reload recovery: Task 4
  - end-to-end stale flow: Task 5
- Placeholder scan:
  - No `TODO`, `TBD`, or “implement later” markers remain.
  - Each code-changing step includes concrete code or exact method signatures.
- Type consistency:
  - Command kind is consistently `reload_session`
  - session field is consistently `lastSeenNativeFingerprint`
  - provider method is consistently `getNativeVersion`

## Notes

- Do not change existing `/resume` semantics or add any fork behavior.
- Do not block chats just because a provider cannot read a fingerprint; first version must fail open in that case.
- Do not derive Claude cwd from project-directory naming; keep using the existing authoritative cwd sources.
- Keep `/reload` on the same logical bridge session record. It refreshes the runtime handle, not the conversation identity.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-07-weak-handoff-reload.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
