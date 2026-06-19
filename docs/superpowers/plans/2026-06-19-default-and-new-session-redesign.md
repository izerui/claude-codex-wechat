# 「默认会话设置」重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把语义打架的「默认会话设置」卡拆成两个清晰功能：纯兜底的「会话默认值」，和显式选 provider+目录的「新建会话」动作。

**Architecture:** 后端删掉「改默认值 → 发'已切换'通知」的误导逻辑；新增 `POST /api/channel/sessions/new` 端点，通过 `conversation.create()` 开新会话并给微信发真实通知。前端把默认值卡做减法，会话区新增「新建会话」表单调用新端点。

**Tech Stack:** TypeScript、Fastify（后端路由）、React（web 面板）、Vitest（测试）。

---

## File Structure

- `src/admin/settingsRoutes.ts` — 删除 provider 变化的「已切换」通知逻辑，精简函数签名。
- `src/daemon/server.ts` — 同步更新 `registerSettingsRoutes` 调用参数。
- `src/admin/channelAdminRoutes.ts` — 新增 `POST /api/channel/sessions/new` 端点。
- `src/web/apiClient.ts` — 新增 `createNewSession` 客户端方法。
- `src/web/WeChatPanel.tsx` — 默认值卡做减法 + 会话区新增「新建会话」表单。
- `tests/channelAdminRoutes.test.ts` — 替换旧的「已切换」通知测试为「不发通知」；新增「新建会话」端点测试。

---

## Task 1: 删除默认值变更的「已切换」通知

**Files:**
- Modify: `src/admin/settingsRoutes.ts`
- Modify: `src/daemon/server.ts:163-170`
- Test: `tests/channelAdminRoutes.test.ts:304-360`（替换）

- [ ] **Step 1: 改写测试——保存默认值不应发任何微信通知**

把 `tests/channelAdminRoutes.test.ts` 第 304-360 行那个 `it('notifies the active weixin user after switching the provider ...')` 整段替换为：

```ts
  it('does not notify the weixin user when default settings change', async () => {
    const channel = new MockChannelAdapter();
    const sent: Array<{ chatId: string; kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ chatId: message.chatId, kind: message.kind, text: message.text }));
    const store = createRuntimeUserStore('bridge-admin-switch-notify-');
    const { app, activeUserStore } = createDaemonServer({
      channel,
      activeUserStore: store.activeUserStore,
      configPath: store.configPath,
      bridgeDefaults: {
        defaultProvider: 'claude-code',
        defaultWorkspace: '/tmp/project',
      },
    });
    const user = activeUserStore.setActiveUser({
      platform: 'weixin',
      platformUserId: 'wx_user_1',
      role: 'user',
    });
    writeFileSync(store.configPath, JSON.stringify({
      bridge: {
        activeWeChatUser: {
          ...user,
          currentConversation: {
            id: 'bs_active_1',
            chatId: 'chat-a',
            ownerUserId: user.id,
            providerId: 'claude-code',
            cwd: '/tmp/active-project',
            recoverySource: 'runtime',
            status: 'idle',
            createdAt: 10,
            lastActivityAt: 20,
          },
        },
      },
    }, null, 2));

    const update = await app.inject({
      method: 'POST',
      url: '/api/settings',
      payload: {
        defaultProvider: 'codex',
        defaultWorkspace: '/tmp/project',
      },
    });

    expect(update.statusCode).toBe(200);
    expect(sent).toEqual([]);

    const next = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(next.json()).toMatchObject({ defaultProvider: 'codex', defaultWorkspace: '/tmp/project' });
    await app.close();
  });
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `pnpm test -- channelAdminRoutes`
Expected: FAIL —— 当前实现仍会发送「对话模型已切换为 Codex...」，`sent` 不为空。

- [ ] **Step 3: 删除 settingsRoutes 中的通知逻辑并精简签名**

把 `src/admin/settingsRoutes.ts` 全文替换为：

```ts
import type { FastifyInstance } from 'fastify';
import { persistBridgeDefaultsToConfigFile } from '../daemon/configPersistence';
import type { ProviderId } from '../providers/types';

export type BridgeSettings = {
  defaultProvider: ProviderId;
  defaultWorkspace: string;
};

export function registerSettingsRoutes(input: {
  app: FastifyInstance;
  defaults: BridgeSettings;
  configPath: string;
}): void {
  input.app.get('/api/settings', async () => input.defaults);

  input.app.post<{ Body: Partial<BridgeSettings> }>('/api/settings', async (request) => {
    const current = { ...input.defaults };
    const next = normalizeSettings({
      ...current,
      ...request.body,
    }, current.defaultWorkspace);
    input.defaults.defaultProvider = next.defaultProvider;
    input.defaults.defaultWorkspace = next.defaultWorkspace;
    await persistBridgeDefaultsToConfigFile({
      configPath: input.configPath,
      defaultProvider: next.defaultProvider,
      defaultWorkspace: next.defaultWorkspace,
    });
    return { ok: true };
  });
}

function normalizeSettings(input: Partial<Record<keyof BridgeSettings, unknown>>, defaultWorkspace: string): BridgeSettings {
  return {
    defaultProvider: input.defaultProvider === 'codex' ? 'codex' : 'claude-code',
    defaultWorkspace: typeof input.defaultWorkspace === 'string' && input.defaultWorkspace.trim()
      ? input.defaultWorkspace
      : defaultWorkspace,
  };
}
```

- [ ] **Step 4: 更新 server.ts 中的调用，移除已不需要的参数**

把 `src/daemon/server.ts:163-170` 的 `registerSettingsRoutes({...})` 调用替换为：

```ts
  registerSettingsRoutes({
    app,
    defaults: bridgeDefaults,
    configPath,
  });
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `pnpm test -- channelAdminRoutes`
Expected: PASS —— `does not notify the weixin user when default settings change` 通过，`sent` 为 `[]`。

- [ ] **Step 6: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误（确认 settingsRoutes 删掉的 import 没有残留引用）。

- [ ] **Step 7: Commit**

```bash
git add src/admin/settingsRoutes.ts src/daemon/server.ts tests/channelAdminRoutes.test.ts
git commit -m "refactor: 默认值变更不再发送误导性的'已切换'通知"
```

---

## Task 2: 新增「新建会话」端点

**Files:**
- Modify: `src/admin/channelAdminRoutes.ts`（在 `/api/channel/sessions/attach` 端点之前或之后新增）
- Test: `tests/channelAdminRoutes.test.ts`（新增一个 `it`）

- [ ] **Step 1: 写失败的测试——新建会话端点开新会话并发真实通知**

在 `tests/channelAdminRoutes.test.ts` 的 `describe('channel admin routes', () => {` 内部末尾（最后一个 `it` 之后、`});` 之前）追加：

```ts
  it('creates a new session with chosen provider and notifies the weixin user', async () => {
    const channel = new MockChannelAdapter();
    const sent: Array<{ chatId: string; kind: string; text: string }> = [];
    channel.onSent((message) => sent.push({ chatId: message.chatId, kind: message.kind, text: message.text }));
    const provider = new FakeProviderAdapter('codex');
    const { app, activeUserStore, sessions } = createDaemonServer({
      channel,
      providers: [provider],
      activeUserStore: createRuntimeUserStore('bridge-admin-new-session-').activeUserStore,
      bridgeDefaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });
    activeUserStore.setActiveUser({ platform: 'weixin', platformUserId: 'wx_user_1', role: 'user' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/new',
      payload: { providerId: 'codex', cwd: '/tmp/my-project', platformUserId: 'wx_user_1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, session: { providerId: 'codex', cwd: '/tmp/my-project' } });

    const current = sessions.getCurrent();
    expect(current).toMatchObject({ providerId: 'codex', cwd: '/tmp/my-project', chatId: 'wx_user_1' });

    expect(sent).toEqual([
      { chatId: 'wx_user_1', kind: 'status', text: '已新建 Codex 会话，项目目录：/tmp/my-project。' },
    ]);
    await app.close();
  });

  it('rejects new session creation when there is no active weixin user', async () => {
    const provider = new FakeProviderAdapter('codex');
    const { app } = createDaemonServer({
      channel: new MockChannelAdapter(),
      providers: [provider],
      activeUserStore: createRuntimeUserStore('bridge-admin-new-session-nouser-').activeUserStore,
      bridgeDefaults: { defaultProvider: 'claude-code', defaultWorkspace: '/tmp/project' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/channel/sessions/new',
      payload: { providerId: 'codex', cwd: '/tmp/my-project', platformUserId: 'wx_user_1' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ ok: false, error: 'active_wechat_user_not_found' });
    await app.close();
  });
```

- [ ] **Step 2: 运行测试，确认它失败**

Run: `pnpm test -- channelAdminRoutes`
Expected: FAIL —— `/api/channel/sessions/new` 端点不存在，返回 404（fastify 默认 not found），`sent` 为空。

- [ ] **Step 3: 实现端点**

在 `src/admin/channelAdminRoutes.ts` 中，紧接 `/api/channel/sessions/attach` 端点块（第 192-230 行那个 `input.app.post(...)` 结束的 `});` 之后）插入：

```ts
  input.app.post<{ Body: {
    providerId: string;
    platformUserId: string;
    cwd?: string;
    chatId?: string;
  } }>('/api/channel/sessions/new', async (request, reply) => {
    if (!input.conversation) {
      return reply.code(500).send({ ok: false, error: 'current_conversation_store_unavailable' });
    }
    const user = input.users.isActiveUser(PRIMARY_WEIXIN_PLATFORM, request.body.platformUserId);
    if (!user) {
      return reply.code(404).send({ ok: false, error: 'active_wechat_user_not_found' });
    }
    const providerId = request.body.providerId === 'codex' ? 'codex' : 'claude-code';
    const cwd = typeof request.body.cwd === 'string' && request.body.cwd.trim()
      ? request.body.cwd
      : input.defaults?.defaultWorkspace ?? process.cwd();
    const chatId = request.body.chatId ?? user.platformUserId;
    const session = input.conversation.create({
      chatId,
      ownerUserId: user.id,
      providerId,
      cwd,
    });
    input.events?.emit({ type: 'channel.current-session-changed' });
    const providerLabel = providerId === 'codex' ? 'Codex' : 'Claude Code';
    await input.channel?.sendMessage({
      chatId,
      kind: 'status',
      text: `已新建 ${providerLabel} 会话，项目目录：${cwd}。`,
    });
    return {
      ok: true,
      session: {
        id: session.id,
        providerId: session.providerId,
        cwd: session.cwd,
        status: session.status,
      },
    };
  });
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test -- channelAdminRoutes`
Expected: PASS —— 两个新测试均通过。

- [ ] **Step 5: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
git add src/admin/channelAdminRoutes.ts tests/channelAdminRoutes.test.ts
git commit -m "feat: 新增 /api/channel/sessions/new 端点，按指定 provider 与目录开新会话并通知微信"
```

---

## Task 3: 新增 apiClient 客户端方法

**Files:**
- Modify: `src/web/apiClient.ts`（紧接 `attachProviderSession` 之后，约第 303 行）

- [ ] **Step 1: 新增 `createNewSession` 方法**

在 `src/web/apiClient.ts` 的 `attachProviderSession` 函数（结束于约第 303 行 `}`）之后插入：

```ts
export async function createNewSession(input: {
  providerId: 'claude-code' | 'codex';
  cwd: string;
  platformUserId: string;
  chatId?: string;
}): Promise<void> {
  await requestJson('/api/channel/sessions/new', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add src/web/apiClient.ts
git commit -m "feat: apiClient 新增 createNewSession 调用新建会话端点"
```

---

## Task 4: web 面板拆 UI——默认值卡做减法 + 新建会话表单

**Files:**
- Modify: `src/web/WeChatPanel.tsx`

注：WeChatPanel 当前无组件测试，本任务用 `pnpm typecheck` + `pnpm build:web` + 浏览器手测验证（见 Step 8）。

- [ ] **Step 1: 引入 `createNewSession`**

把 `src/web/WeChatPanel.tsx` 顶部 import 块里的 `attachProviderSession,`（第 7 行）后面追加一行 `createNewSession,`，即：

```tsx
  attachProviderSession,
  createNewSession,
  disableWeixinPlugin,
```

- [ ] **Step 2: 新增本地状态**

在 `const [savingSettings, setSavingSettings] = useState(false);`（第 77 行）之后插入：

```tsx
  const [newSessionProvider, setNewSessionProvider] = useState<'claude-code' | 'codex'>('claude-code');
  const [newSessionCwd, setNewSessionCwd] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
```

- [ ] **Step 3: 默认值加载后预填新建会话目录**

在 `useEffect(() => { void refresh(); }, [refresh]);`（第 108-110 行）之后插入：

```tsx
  useEffect(() => {
    if (settings?.defaultWorkspace) {
      setNewSessionCwd((current) => current || settings.defaultWorkspace);
    }
  }, [settings]);
```

- [ ] **Step 4: 新增提交「新建会话」的 handler**

在 `saveDefaultSettings` 函数（结束于第 212 行 `};`）之后插入：

```tsx
  const submitNewSession = async () => {
    if (!activeUser?.platformUserId) {
      setError('no_active_wechat_user');
      return;
    }
    if (creatingSession) return;
    setError(null);
    setCreatingSession(true);
    try {
      await createNewSession({
        providerId: newSessionProvider,
        cwd: newSessionCwd,
        platformUserId: activeUser.platformUserId,
        chatId: activeUser.platformUserId,
      });
      const nextCurrentSession = await fetchCurrentSession();
      input.onRefreshCurrentSession?.(nextCurrentSession);
      await refresh();
      input.onNotice?.('已新建会话');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingSession(false);
    }
  };
```

- [ ] **Step 5: 默认值卡做减法（改标题 + 加说明）**

把 `src/web/WeChatPanel.tsx` 第 397 行：

```tsx
        <div className="card-header">默认会话设置</div>
        <div className="card-body">
```

替换为：

```tsx
        <div className="card-header">会话默认值</div>
        <div className="card-body">
          <p className="text-muted-soft small mb-3">仅在未指定时生效：新用户首次对话、或无当前会话自动接入时按此默认值新建。</p>
```

- [ ] **Step 6: 在默认值卡之前插入「新建会话」卡**

在 `src/web/WeChatPanel.tsx` 第 396 行 `<div className="soft-card mb-2">`（即「会话默认值」卡的开头）之前插入整块：

```tsx
      {activeUser && isPluginConnected(plugin) ? (
        <div className="soft-card mb-2">
          <div className="card-header">新建会话</div>
          <div className="card-body">
            <p className="text-muted-soft small mb-3">用指定的提供方与目录开启一个新对话，立即成为当前会话，并通知微信。</p>
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="form-label" htmlFor="new-session-provider">提供方</label>
                <select
                  id="new-session-provider"
                  className="form-select"
                  value={newSessionProvider}
                  onChange={(event) => setNewSessionProvider(event.target.value === 'codex' ? 'codex' : 'claude-code')}
                >
                  <option value="claude-code">Claude Code</option>
                  <option value="codex">Codex CLI</option>
                </select>
              </div>
              <div className="col-md-5">
                <label className="form-label" htmlFor="new-session-cwd">工作目录</label>
                <input
                  id="new-session-cwd"
                  className="form-control"
                  value={newSessionCwd}
                  onChange={(event) => setNewSessionCwd(event.target.value)}
                  type="text"
                />
              </div>
              <div className="col-md-3">
                <button
                  className="btn btn-accent w-100"
                  disabled={creatingSession || !newSessionCwd.trim()}
                  onClick={() => void submitNewSession()}
                  type="button"
                >
                  {creatingSession ? '新建中...' : '新建会话'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

```

- [ ] **Step 7: 类型检查 + 构建**

Run: `pnpm typecheck && pnpm build:web`
Expected: 均无错误。

- [ ] **Step 8: 浏览器手测**

Run: `pnpm dev`（另起一个终端 `pnpm web` 起前端），在浏览器打开 web 面板：
1. 微信已连接、有 activeUser 时，「新建会话」卡可见，工作目录预填默认值。
2. 选 Codex、改目录、点「新建会话」→ 顶部「当前会话」刷新为 codex + 新目录；微信收到「已新建 Codex 会话，项目目录：…」。
3. 「会话默认值」卡改 provider/目录保存 → 微信**不**再收到「已切换」通知，当前会话不受影响。

如无法跑起浏览器，明确说明未手测，不要假称通过。

- [ ] **Step 9: Commit**

```bash
git add src/web/WeChatPanel.tsx
git commit -m "feat: web 面板拆分会话默认值与新建会话，新建会话即时切换当前对话"
```

---

## Self-Review 结论

- **Spec 覆盖**：功能一（默认值做减法、删通知）= Task 1 + Task 4 Step 5；功能二（新建会话端点 + 真实通知）= Task 2 + Task 3 + Task 4。✅
- **Placeholder 扫描**：无 TBD/TODO，所有步骤含完整代码与命令。✅
- **类型一致性**：端点返回 `{ ok, session: { id, providerId, cwd, status } }`，测试与 apiClient 入参字段（`providerId/cwd/platformUserId/chatId`）一致；`createNewSession` 签名与端点 Body 一致。✅
