# 5177 纯 Bootstrap 控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 5177 本地控制台页面重构为完全原生 Bootstrap 风格的中文控制台，同时保持现有 API 协议与核心会话/微信操作语义不变。

**Architecture:** 通过在前端入口接入 Bootstrap 样式，将 `App.tsx` 从深色自定义 dashboard 改写为标准 Bootstrap 页面骨架，并把 `WeChatPanel.tsx` 重组为三个 Bootstrap card（微信通道、配置、会话）。实现阶段尽量删除 `styles.ts` 中的定制视觉依赖，改用 JSX 里的 Bootstrap className 和少量语义辅助函数。测试侧更新为面向新的中文文案与 Bootstrap 结构做断言，避免继续依赖旧的“监控区 / Hero”文案。

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Bootstrap 5, bootstrap-icons

---

## File Structure

- **Modify:** `src/web/main.tsx`
  - 接入 Bootstrap 全局样式（和可选 bootstrap-icons）
- **Modify:** `src/web/App.tsx`
  - 删除当前 Hero + 自定义 dashboard，改为 Bootstrap navbar / 页面标题 / 状态卡片 / WeChatPanel 容器
- **Modify:** `src/web/WeChatPanel.tsx`
  - 删除现有深色面板与自定义布局，重组为纯 Bootstrap card、alert、tabs、table、form
- **Modify or remove:** `src/web/styles.ts`
  - 若 `App.tsx` / `WeChatPanel.tsx` 不再依赖，删除深色 token；若仍需极少量兼容，可最小化保留
- **Modify:** `tests/web/appDashboard.test.tsx`
  - 更新 Dashboard 文案与结构断言
- **Check:** `tests/web/appInteractions.test.tsx`
  - 如依赖旧 UI 文案/结构，按新页面更新
- **Check:** `tests/web/providerDiagnostics.test.tsx`
  - 如依赖旧状态摘要文案，按新页面更新

---

### Task 1: 接入 Bootstrap 全局样式并锁定页面骨架

**Files:**
- Modify: `src/web/main.tsx`
- Modify: `src/web/App.tsx`
- Test: `tests/web/appDashboard.test.tsx`

- [ ] **Step 1: 先写失败测试，确认旧 Hero 文案会被移除并出现新标题**

```tsx
expect(await screen.findByRole('heading', { name: '桥接控制台' })).toBeTruthy();
expect(screen.queryByText('5177 页面')).toBeNull();
expect(screen.queryByText('监控区')).toBeNull();
expect(await screen.findByText('概览 · 实时')).toBeTruthy();
```

- [ ] **Step 2: 运行单测，确认它先失败**

Run:
```bash
pnpm vitest run tests/web/appDashboard.test.tsx
```

Expected:
- FAIL
- 旧页面仍然渲染 `5177 页面` / `监控区`
- 新标题 `桥接控制台` 尚未按计划出现

- [ ] **Step 3: 在入口文件接入 Bootstrap CSS**

`src/web/main.tsx`
```tsx
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: 用 Bootstrap 页面骨架重写 `App.tsx` 顶层结构**

`src/web/App.tsx`
```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchCurrentSession,
  fetchProviderStatus,
  fetchStatus,
  stopCurrentSession,
  type CurrentSessionView,
  type ProviderStatusView,
  type StatusView,
} from './apiClient';
import { WeChatPanel } from './WeChatPanel';

export function App() {
  const [status, setStatus] = useState<StatusView | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusView | null>(null);
  const [currentSession, setCurrentSession] = useState<CurrentSessionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, nextProviderStatus, nextCurrentSession] = await Promise.all([
        fetchStatus(),
        fetchProviderStatus(),
        fetchCurrentSession(),
      ]);
      setStatus(nextStatus);
      setProviderStatus(nextProviderStatus);
      setCurrentSession(nextCurrentSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeSessionCount = useMemo(
    () => (currentSession && currentSession.status !== 'closed' ? 1 : 0),
    [currentSession],
  );

  return (
    <div className="bg-body-tertiary min-vh-100">
      <Navbar onRefresh={() => void refresh()} statusOk={status?.ok === true} />

      <main className="container-fluid py-4" style={{ maxWidth: 1180 }}>
        <header className="mb-4">
          <h1 className="h3 mb-1">桥接控制台</h1>
          <p className="text-muted text-uppercase fw-semibold mb-0 small">概览 · 实时</p>
        </header>

        <StatusCards
          status={status}
          providerStatus={providerStatus}
          activeSessionCount={activeSessionCount}
        />

        {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}

        <WeChatPanel
          currentSession={currentSession}
          onStopCurrentSession={async () => {
            await stopCurrentSession();
            await refresh();
          }}
          onRefreshCurrentSession={setCurrentSession}
        />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: 用 Bootstrap navbar 和状态卡片替换旧 Header / Dashboard**

`src/web/App.tsx`
```tsx
function Navbar(input: { statusOk: boolean; onRefresh(): void }) {
  return (
    <nav className="navbar navbar-expand-lg bg-body-tertiary border-bottom sticky-top">
      <div className="container-fluid">
        <span className="navbar-brand d-flex align-items-center gap-2 mb-0 h1">
          <i className="bi bi-broadcast-pin fs-5 text-primary" />
          <span>claude-codex-wechat</span>
        </span>
        <div className="collapse navbar-collapse show">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0 ms-3">
            <li className="nav-item"><span className="nav-link active">控制台</span></li>
            <li className="nav-item"><span className="nav-link">日志</span></li>
            <li className="nav-item"><span className="nav-link">设置</span></li>
          </ul>
          <div className="d-flex align-items-center gap-2">
            <span className={`badge rounded-pill ${input.statusOk ? 'text-bg-success' : 'text-bg-warning'}`}>
              {input.statusOk ? '在线' : '待确认'}
            </span>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={input.onRefresh}>
              <i className="bi bi-arrow-clockwise me-1" />刷新
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

function StatusCards(input: {
  status: StatusView | null;
  providerStatus: ProviderStatusView | null;
  activeSessionCount: number;
}) {
  return (
    <div className="row g-3 mb-3">
      <StatusCard title="桥接" value={input.status?.ok ? '运行中' : '未知'} detail="127.0.0.1:5177" tone={input.status?.ok ? 'success' : 'warning'} />
      <StatusCard title="微信" value={input.activeSessionCount > 0 ? '已连接' : '未连接'} detail={`活跃会话 ${input.activeSessionCount}`} tone={input.activeSessionCount > 0 ? 'success' : 'warning'} />
      <StatusCard title="claude" value={formatProviderStatus(input.providerStatus?.claude)} detail={readProviderCommand(input.providerStatus?.claude) ?? '-'} tone={providerTone(input.providerStatus?.claude)} />
      <StatusCard title="codex" value={formatProviderStatus(input.providerStatus?.codex)} detail={readProviderCommand(input.providerStatus?.codex) ?? '-'} tone={providerTone(input.providerStatus?.codex)} />
    </div>
  );
}
```

- [ ] **Step 6: 运行测试，确认新骨架通过**

Run:
```bash
pnpm vitest run tests/web/appDashboard.test.tsx
```

Expected:
- 至少第一条测试从“找不到新标题”转为 PASS
- 若第二条仍因旧 provider 文案失败，留给下一任务处理

- [ ] **Step 7: 提交这一小步**

```bash
git add src/web/main.tsx src/web/App.tsx tests/web/appDashboard.test.tsx
git commit -m "refactor: replace 5177 dashboard shell with bootstrap layout"
```

---

### Task 2: 用 Bootstrap 结构重写微信通道与配置区

**Files:**
- Modify: `src/web/WeChatPanel.tsx`
- Test: `tests/web/appInteractions.test.tsx`

- [ ] **Step 1: 为微信通道和配置区补失败断言**

在相关测试中加入：

```tsx
expect(await screen.findByText('微信通道')).toBeTruthy();
expect(await screen.findByText('配置')).toBeTruthy();
expect(await screen.findByLabelText('提供方')).toBeTruthy();
expect(await screen.findByLabelText('工作目录')).toBeTruthy();
expect(await screen.findByRole('button', { name: '保存' })).toBeTruthy();
```

- [ ] **Step 2: 运行对应测试，确认旧结构不满足新断言**

Run:
```bash
pnpm vitest run tests/web/appInteractions.test.tsx
```

Expected:
- FAIL
- 现有 `会话配置` / `当前控制` 等旧结构与新文案不一致

- [ ] **Step 3: 用 Bootstrap card 重写微信通道区块**

`src/web/WeChatPanel.tsx`
```tsx
function WeixinChannelCard(input: {
  plugin: ChannelPluginView | null;
  runtimeConfig: WeixinRuntimeConfigView | null;
  activeUser: ActiveWeChatUserView | null;
  busy: boolean;
  onDisconnect(): Promise<void>;
  onStartQrLogin(): void;
  loginState: LoginState;
  qrcodeData: string | null;
}) {
  return (
    <div className="card mb-3">
      <h5 className="card-header d-flex justify-content-between align-items-center mb-0">
        <span>微信通道</span>
        <span className="badge text-bg-light text-muted text-uppercase fw-semibold">机器人账号与登录</span>
      </h5>
      <div className="card-body">
        <dl className="row mb-3">
          <dt className="col-sm-2 text-muted text-uppercase fw-semibold small">机器人</dt>
          <dd className="col-sm-4 font-monospace">{input.plugin?.botUsername ?? '-'}</dd>
          <dt className="col-sm-2 text-muted text-uppercase fw-semibold small">用户</dt>
          <dd className="col-sm-4 font-monospace">{input.activeUser?.displayName ?? input.activeUser?.platformUserId ?? '-'}</dd>
          <dt className="col-sm-2 text-muted text-uppercase fw-semibold small">平台 ID</dt>
          <dd className="col-sm-4 font-monospace">{input.activeUser?.platformUserId ?? '-'}</dd>
          <dt className="col-sm-2 text-muted text-uppercase fw-semibold small">网关</dt>
          <dd className="col-sm-4 font-monospace">{input.runtimeConfig?.baseUrl ?? '-'}</dd>
        </dl>

        {!isPluginConnected(input.plugin) ? (
          <button type="button" className="btn btn-primary" onClick={input.onStartQrLogin} disabled={input.loginState === 'loading_qr'}>
            {input.loginState === 'loading_qr' ? '正在加载二维码...' : '扫码登录'}
          </button>
        ) : (
          <div className="text-end">
            <button type="button" className="btn btn-sm btn-outline-danger" disabled={input.busy} onClick={() => void input.onDisconnect()}>
              <i className="bi bi-box-arrow-right me-1" />断开连接
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 用 Bootstrap form card 重写配置区块**

`src/web/WeChatPanel.tsx`
```tsx
function SettingsCard(input: {
  settings: BridgeSettingsView | null;
  savingSettings: boolean;
  onChangeDefaultProvider(provider: 'claude-code' | 'codex'): void;
  onChangeWorkspace(workspace: string): void;
  onSave(): Promise<void>;
}) {
  if (!input.settings) return null;

  return (
    <div className="card mb-3">
      <h5 className="card-header d-flex justify-content-between align-items-center mb-0">
        <span>配置</span>
        <span className="badge text-bg-light text-muted text-uppercase fw-semibold">作用于当前与下次对话</span>
      </h5>
      <div className="card-body">
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label htmlFor="default-provider" className="form-label fw-semibold">提供方</label>
            <select
              id="default-provider"
              className="form-select font-monospace"
              value={input.settings.defaultProvider}
              onChange={(event) => input.onChangeDefaultProvider(event.target.value === 'codex' ? 'codex' : 'claude-code')}
            >
              <option value="claude-code">claude-code</option>
              <option value="codex">codex</option>
            </select>
          </div>
          <div className="col-md-7">
            <label htmlFor="default-workspace" className="form-label fw-semibold">工作目录</label>
            <input
              id="default-workspace"
              className="form-control font-monospace"
              value={input.settings.defaultWorkspace}
              onChange={(event) => input.onChangeWorkspace(event.target.value)}
            />
          </div>
          <div className="col-md-2 d-grid">
            <button type="button" className="btn btn-primary" disabled={input.savingSettings} onClick={() => void input.onSave()}>
              {input.savingSettings ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
        <p className="form-text font-monospace">修改即时生效，覆盖当前会话与下次新会话。</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 在 `WeChatPanel` 主 render 中接入这两个新卡片，删除旧的“会话配置 / 当前控制”块**

```tsx
return (
  <section>
    {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}
    {notice ? <div className="alert alert-success" role="alert">{notice}</div> : null}

    <WeixinChannelCard
      plugin={plugin}
      runtimeConfig={runtimeConfig}
      activeUser={activeUser}
      busy={busy}
      onDisconnect={disconnect}
      onStartQrLogin={startQrLogin}
      loginState={loginState}
      qrcodeData={qrcodeData}
    />

    <SettingsCard
      settings={settings}
      savingSettings={savingSettings}
      onChangeDefaultProvider={changeDefaultProvider}
      onChangeWorkspace={(defaultWorkspace) => setSettings((current) => current ? { ...current, defaultWorkspace } : current)}
      onSave={saveDefaultSettings}
    />

    <SessionsCard ... />
  </section>
);
```

- [ ] **Step 6: 运行相关测试**

Run:
```bash
pnpm vitest run tests/web/appInteractions.test.tsx
```

Expected:
- PASS，或仅剩会话区相关断言失败

- [ ] **Step 7: 提交这一小步**

```bash
git add src/web/WeChatPanel.tsx tests/web/appInteractions.test.tsx
git commit -m "refactor: rebuild wechat channel settings with bootstrap cards"
```

---

### Task 3: 把当前会话与可接入会话合并到同一张 Bootstrap card

**Files:**
- Modify: `src/web/WeChatPanel.tsx`
- Test: `tests/web/appInteractions.test.tsx`
- Test: `tests/web/providerDiagnostics.test.tsx`

- [ ] **Step 1: 先写失败断言，锁定“同一张 card + 当前/可接入分段”**

```tsx
expect(await screen.findByText('会话')).toBeTruthy();
expect(await screen.findByText('当前')).toBeTruthy();
expect(await screen.findByText('可接入')).toBeTruthy();
expect(await screen.findByRole('button', { name: '停止会话' })).toBeTruthy();
expect(await screen.findByRole('button', { name: '接入' })).toBeTruthy();
```

- [ ] **Step 2: 运行测试，确认旧的原生会话工作台结构不满足新设计**

Run:
```bash
pnpm vitest run tests/web/appInteractions.test.tsx tests/web/providerDiagnostics.test.tsx
```

Expected:
- FAIL
- 旧的 `原生会话工作台`、`接入会话` 文案与结构仍存在

- [ ] **Step 3: 新建 `SessionsCard` 组件，用 Bootstrap card/alert/nav-tabs/table 重组会话区**

`src/web/WeChatPanel.tsx`
```tsx
function SessionsCard(input: {
  currentSession: CurrentSessionView | null;
  currentUserLabel: string | undefined;
  activeUser: ActiveWeChatUserView | null;
  activeSessionTab: SessionTab;
  recoverableSessions: RecoverableProviderSessionView[];
  attachingSessionId: string | null;
  onStopCurrentSession(): Promise<void>;
  onScanRecoverableSessions(providerId: 'claude-code' | 'codex'): Promise<void>;
  onAttachRecoverableSession(session: RecoverableProviderSessionView): Promise<void>;
}) {
  const filteredRecoverableSessions = input.recoverableSessions.filter((session) => (
    input.activeSessionTab === 'claude-native' ? session.providerId === 'claude-code' : session.providerId === 'codex'
  ));

  return (
    <div className="card">
      <h5 className="card-header d-flex justify-content-between align-items-center mb-0">
        <span>会话</span>
        <span className="badge text-bg-light text-muted text-uppercase fw-semibold">已挂载 + 可切换</span>
      </h5>
      <div className="card-body">
        <p className="text-muted text-uppercase fw-semibold mb-2 small">当前</p>
        <div className="alert alert-primary d-flex align-items-center gap-3 flex-wrap mb-4" role="alert">
          <span className="badge rounded-pill text-bg-primary">{input.currentSession?.providerId ?? 'claude-code'}</span>
          <span className="d-inline-flex align-items-baseline gap-1">
            <span className="text-muted small">目录</span>
            <span className="font-monospace">{input.currentSession?.cwd ?? '-'}</span>
          </span>
          <span className="d-inline-flex align-items-baseline gap-1">
            <span className="text-muted small">进程</span>
            <span className="font-monospace">{input.currentSession?.pid ?? '-'}</span>
          </span>
          <span className="d-inline-flex align-items-baseline gap-1">
            <span className="text-muted small">启动于</span>
            <span className="font-monospace">{input.currentSession?.startedAt ?? '-'}</span>
          </span>
          {input.currentSession && input.currentSession.status !== 'closed' ? (
            <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={() => void input.onStopCurrentSession()}>
              停止会话
            </button>
          ) : null}
        </div>

        <p className="text-muted text-uppercase fw-semibold mb-2 small">可接入</p>
        <ul className="nav nav-tabs" role="tablist">
          <li className="nav-item" role="presentation">
            <button className={`nav-link ${input.activeSessionTab === 'claude-native' ? 'active' : ''}`} type="button" onClick={() => void input.onScanRecoverableSessions('claude-code')}>
              claude-code <span className="badge text-bg-secondary ms-1">{input.recoverableSessions.filter((session) => session.providerId === 'claude-code').length}</span>
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button className={`nav-link ${input.activeSessionTab === 'codex-native' ? 'active' : ''}`} type="button" onClick={() => void input.onScanRecoverableSessions('codex')}>
              codex <span className="badge text-bg-secondary ms-1">{input.recoverableSessions.filter((session) => session.providerId === 'codex').length}</span>
            </button>
          </li>
        </ul>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th scope="col" className="text-uppercase small fw-semibold">会话</th>
                <th scope="col" className="text-uppercase small fw-semibold">目录</th>
                <th scope="col" className="text-uppercase small fw-semibold">更新</th>
                <th scope="col" className="text-uppercase small fw-semibold text-end">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecoverableSessions.map((session) => (
                <tr key={`${session.providerId}:${session.id}`}>
                  <td className="font-monospace">{session.title ?? session.id}</td>
                  <td className="font-monospace">{session.cwd ?? '-'}</td>
                  <td className="text-muted">{session.resumeTitle ?? '-'}</td>
                  <td className="text-end">
                    <button type="button" className="btn btn-sm btn-outline-primary" disabled={input.attachingSessionId !== null} onClick={() => void input.onAttachRecoverableSession(session)}>
                      {input.attachingSessionId === session.id ? '接入中...' : '接入'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 把 `WeChatPanel` 主体替换为 3 张 card 的顺序：微信通道 → 配置 → 会话**

```tsx
return (
  <section>
    {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}
    {notice ? <div className="alert alert-success" role="alert">{notice}</div> : null}
    <WeixinChannelCard ... />
    <SettingsCard ... />
    <SessionsCard ... />
  </section>
);
```

- [ ] **Step 5: 删除不再使用的深色布局样式与按钮样式引用**

从 `src/web/WeChatPanel.tsx` 删掉：
```tsx
import { badgeStyle, buttonStyles, layout, textStyles, tokens } from './styles';
```

替换为：
```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
```

并删除文件底部这类仅服务旧 UI 的对象：
```tsx
const styles: Record<string, React.CSSProperties> = { ... }
```

只在二维码渲染必须存在时保留最小内联样式，例如：
```tsx
<div className="border rounded p-3 bg-white d-inline-flex justify-content-center" data-testid="weixin-login-qr">
  <QRCodeSVG ... />
</div>
```

- [ ] **Step 6: 跑会话相关测试**

Run:
```bash
pnpm vitest run tests/web/appInteractions.test.tsx tests/web/providerDiagnostics.test.tsx
```

Expected:
- PASS，或只剩 `appDashboard.test.tsx` provider 文案同步问题

- [ ] **Step 7: 提交这一小步**

```bash
git add src/web/WeChatPanel.tsx tests/web/appInteractions.test.tsx tests/web/providerDiagnostics.test.tsx
git commit -m "refactor: merge current and attach sessions in bootstrap card"
```

---

### Task 4: 删除旧深色样式依赖并完成 dashboard 测试更新

**Files:**
- Modify: `src/web/App.tsx`
- Modify: `src/web/styles.ts`
- Modify: `tests/web/appDashboard.test.tsx`

- [ ] **Step 1: 先把 dashboard 断言更新为新文案和新 provider 表达**

`tests/web/appDashboard.test.tsx`
```tsx
expect(await screen.findByRole('heading', { name: '桥接控制台' })).toBeTruthy();
expect(await screen.findByText('概览 · 实时')).toBeTruthy();
expect(await screen.findByText('桥接')).toBeTruthy();
expect(await screen.findByText('claude')).toBeTruthy();
expect(await screen.findByText('codex')).toBeTruthy();
expect((await screen.findAllByText('已检测 · 2.0.1')).length).toBeGreaterThan(0);
expect((await screen.findAllByText('未找到可执行文件')).length).toBeGreaterThan(0);
expect(screen.queryByText('桥接总览与接入摘要')).toBeNull();
```

- [ ] **Step 2: 对 detail 文案改成只校验当前页面保留的 provider command**

```tsx
expect(await screen.findByText('/opt/bin/claude')).toBeTruthy();
expect(await screen.findByText('/opt/bin/codex')).toBeTruthy();
expect(screen.queryByText(`/opt/bin/claude · 检查于 ${expectedCheckedAt}`)).toBeNull();
```

- [ ] **Step 3: 运行 dashboard 测试，确认新的断言能真实覆盖新页面**

Run:
```bash
pnpm vitest run tests/web/appDashboard.test.tsx
```

Expected:
- PASS
- 不再依赖旧 Hero / 监控区 / 接入摘要

- [ ] **Step 4: 删除 `App.tsx` 中剩余的 `styles.ts` 依赖**

从 `src/web/App.tsx` 删除：
```tsx
import { badgeStyle, buttonStyles, layout, textStyles, tokens } from './styles';
```

并确保 `App.tsx` 不再引用：
```tsx
Header
Dashboard
Metric
ProviderSummary
styles.error
layout.*
textStyles.*
badgeStyle(...)
buttonStyles.*
```

- [ ] **Step 5: 删除 `src/web/styles.ts` 或最小化为零引用状态**

若 `App.tsx` 与 `WeChatPanel.tsx` 均不再引用 `./styles`，直接删除文件：
```bash
rm src/web/styles.ts
```

若还有残余引用，则先清理引用后再删除。

- [ ] **Step 6: 跑完整前端测试集**

Run:
```bash
pnpm vitest run tests/web/appDashboard.test.tsx tests/web/appInteractions.test.tsx tests/web/providerDiagnostics.test.tsx
```

Expected:
- PASS
- 三个 web 测试文件都通过

- [ ] **Step 7: 提交这一小步**

```bash
git add src/web/App.tsx src/web/WeChatPanel.tsx src/web/main.tsx tests/web/appDashboard.test.tsx tests/web/appInteractions.test.tsx tests/web/providerDiagnostics.test.tsx src/web/styles.ts
git commit -m "refactor: rebuild 5177 console with native bootstrap ui"
```

---

### Task 5: 做最终验证并确认页面符合 spec

**Files:**
- Check: `src/web/App.tsx`
- Check: `src/web/WeChatPanel.tsx`
- Check: `tests/web/appDashboard.test.tsx`
- Check: `tests/web/appInteractions.test.tsx`
- Check: `tests/web/providerDiagnostics.test.tsx`

- [ ] **Step 1: 跑全部相关测试**

Run:
```bash
pnpm vitest run tests/web/appDashboard.test.tsx tests/web/appInteractions.test.tsx tests/web/providerDiagnostics.test.tsx
```

Expected:
- PASS
- 没有因旧 UI 文案导致的失败

- [ ] **Step 2: 启动前端并人工查看 Bootstrap 页面**

Run:
```bash
pnpm run dev
```

Expected:
- 本地页面可打开
- 页面顺序为：navbar → 状态 → 微信通道 → 配置 → 会话
- 不再出现深色主题、Hero、大面积自定义样式

- [ ] **Step 3: 对照 spec 做人工核验**

检查以下结果全部成立：
```text
- 中文界面
- 完全浅色 Bootstrap 风格
- 微信通道在配置前面
- 配置在会话前面
- 当前会话和可接入会话在同一张 card 内
- 没有额外 hover / transition / 自定义效果
- 没有额外 JS 交互逻辑
```

- [ ] **Step 4: 提交最终验证结果**

```bash
git status --short
```

Expected:
- 只有本次预期改动
- 没有意外新增文件

- [ ] **Step 5: 最终提交**

```bash
git add src/web/main.tsx src/web/App.tsx src/web/WeChatPanel.tsx tests/web/appDashboard.test.tsx tests/web/appInteractions.test.tsx tests/web/providerDiagnostics.test.tsx
git commit -m "refactor: redesign 5177 console with pure bootstrap layout"
```

---

## Self-Review

### Spec coverage

- **完全原生 Bootstrap 风格** → Task 1, 2, 3, 4
- **页面顺序固定** → Task 1 + Task 3
- **微信通道上移** → Task 2
- **配置上移** → Task 2
- **当前会话 + 可接入会话同卡区分** → Task 3
- **不加非 Bootstrap 效果和事件** → Task 1, 3, 4, 5
- **保持 API 语义不变** → 全部任务默认保持现有 fetch / action 路径
- **更新测试** → Task 1, 2, 3, 4, 5

没有遗漏的 spec 要求。

### Placeholder scan

- 没有 `TODO` / `TBD`
- 每个任务都包含了明确文件、命令、预期结果
- 涉及代码修改的步骤都给了具体代码片段

### Type consistency

- `Navbar`, `StatusCards`, `StatusCard`, `WeixinChannelCard`, `SettingsCard`, `SessionsCard` 命名一致
- `changeDefaultProvider`, `saveDefaultSettings`, `attachRecoverableSession`, `scanRecoverableSessions` 与现有 `WeChatPanel` 逻辑一致
- 使用的类型 `CurrentSessionView`, `ProviderStatusView`, `BridgeSettingsView`, `RecoverableProviderSessionView`, `ActiveWeChatUserView`, `ChannelPluginView`, `WeixinRuntimeConfigView` 都来自现有代码

Plan complete and saved to `docs/superpowers/plans/2026-06-16-5177-pure-bootstrap-redesign.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration

2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
