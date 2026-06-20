# 顶部驾驶舱重设计实现计划（双引擎舱 + 通道条）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把控制台首屏的四张等宽状态卡 + 微信通道信息整合为"通道条 + 双引擎舱"的驾驶舱，消除当前会话与通道信息的重复，并保持移动端友好。

**Architecture:** 抽出共享格式化模块 `statusFormat.ts`；新增纯展示组件 `Cockpit.tsx`（`ChannelStrip` + `EngineBays`）；`WeChatPanel` 在顶部渲染驾驶舱并接收 `providerStatus`，复用其已有的连接状态机（plugin/activeUser/runtimeConfig/currentSession/loginState/disconnect/startQrLogin）；`App` 删除 `StatusCards` 并把 `providerStatus` 下传。

**Tech Stack:** React 18 + TypeScript + Bootstrap 5 + 自定义 CSS token（oklch 暖色）+ Vitest/jsdom + Testing Library。

参考设计文档：`docs/superpowers/specs/2026-06-20-cockpit-dashboard-redesign-design.md`

---

## 文件结构

- **新增** `src/web/statusFormat.ts` — 共享格式化函数与常量（从 `App.tsx` 与 `WeChatPanel.tsx` 抽出），单一职责：把后端原始字段转成展示用文案/样式类。
- **新增** `src/web/Cockpit.tsx` — 纯展示组件：`ChannelStrip`、`EngineBay`、`EngineBays`。无自身状态，全部靠 props。
- **修改** `src/web/WeChatPanel.tsx` — 顶部渲染驾驶舱；删除旧的通道信息块/会话详情块/原位断开按钮；登录按钮与 QR 区移到通道条下方；新增 `providerStatus` prop；改用 `statusFormat.ts`。
- **修改** `src/web/App.tsx` — 删除 `StatusCards`/`StatusCard` 及其专用格式化函数；把 `providerStatus` 传入 `<WeChatPanel>`。
- **修改** `src/web/styles.css` — 新增 `.engine-bay` / `.engine-bay-active` / `.channel-strip` 等样式。
- **修改** `tests/web/appInteractions.test.tsx` — 更新一条针对旧"当前会话"卡的断言。
- **新增** `tests/web/cockpit.test.tsx` — 驾驶舱组件单元测试。

---

## Task 1: 抽出共享格式化模块 `statusFormat.ts`

**Files:**
- Create: `src/web/statusFormat.ts`
- Test: `tests/web/statusFormat.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/web/statusFormat.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  formatProviderStatus,
  providerTone,
  readProviderCommand,
  formatPluginBadge,
  isPluginConnected,
  formatSessionStatusBadgeClass,
} from '../../src/web/statusFormat';

describe('statusFormat', () => {
  it('formats detected provider with version', () => {
    expect(formatProviderStatus({ detected: true, version: '2.0.1' })).toBe('v2.0.1');
    expect(providerTone({ detected: true })).toBe('success');
    expect(readProviderCommand({ command: '/opt/bin/claude' })).toBe('/opt/bin/claude');
  });

  it('formats missing binary provider', () => {
    expect(formatProviderStatus({ detected: false, reason: 'missing_binary' })).toBe('未找到可执行文件');
    expect(providerTone({ detected: false, reason: 'missing_binary' })).toBe('warning');
  });

  it('formats plugin and session helpers', () => {
    expect(isPluginConnected({ enabled: true, connected: true } as never)).toBe(true);
    expect(formatPluginBadge({ enabled: true, connected: true } as never)).toBe('已连接');
    expect(formatSessionStatusBadgeClass('running')).toBe('badge-solid-success');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/web/statusFormat.test.ts`
Expected: FAIL（找不到模块 `src/web/statusFormat`）

- [ ] **Step 3: 创建 `src/web/statusFormat.ts`**

```ts
import type { CSSProperties } from 'react';
import type { ChannelPluginView, CurrentSessionView } from './apiClient';

export type StatusTone = 'success' | 'warning' | 'neutral';

export const ELLIPSIS: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export function isPluginConnected(plugin: ChannelPluginView | null): boolean {
  return plugin?.enabled === true && plugin.connected === true;
}

export function formatPluginBadge(plugin: ChannelPluginView | null): string {
  if (!plugin?.enabled) return '未连接';
  if (plugin.connected) return '已连接';
  if (plugin.status === 'session_timeout') return '会话超时';
  if (plugin.status === 'connecting') return '连接中';
  if (plugin.status === 'poll_error') return '轮询异常';
  return '未连接';
}

export function formatPluginBadgeClass(plugin: ChannelPluginView | null): string {
  if (isPluginConnected(plugin)) return 'badge-solid-success';
  if (plugin?.status === 'session_timeout' || plugin?.status === 'poll_error') return 'badge-solid-error';
  if (plugin?.status === 'connecting') return 'badge-soft-accent';
  return 'badge-soft-neutral';
}

export function formatPluginHint(plugin: ChannelPluginView | null): string | null {
  if (!plugin?.enabled) return null;
  if (plugin.status === 'session_timeout') return '微信 bot 会话已失效，请重新扫码登录以刷新 token。';
  if (plugin.status === 'poll_error') return '微信消息轮询异常，请检查网络或重新扫码登录。';
  if (plugin.status === 'connecting') return '微信通道正在建立轮询连接。';
  return null;
}

export function formatProviderLabel(providerId: string): string {
  return providerId === 'codex' ? 'Codex CLI' : 'Claude Code';
}

export function formatProviderBadgeClass(providerId: string): string {
  return providerId === 'codex' ? 'badge-soft-success' : 'badge-soft-accent';
}

export function formatSessionStatusBadgeClass(status: string): string {
  if (status === 'running' || status === 'active') return 'badge-solid-success';
  if (status === 'error' || status === 'failed') return 'badge-solid-error';
  return 'badge-soft-neutral';
}

export function formatTimestamp(value?: number): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function readProviderCommand(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return typeof record.command === 'string' && record.command ? record.command : null;
}

export function formatProviderStatus(value: unknown): string {
  if (!value || typeof value !== 'object') return '未知';
  const record = value as Record<string, unknown>;
  if (record.detected === true) {
    return typeof record.version === 'string' && record.version ? `v${record.version}` : '已检测';
  }
  if (record.reason === 'missing_binary') return '未找到可执行文件';
  if (record.reason === 'command_failed') return '命令执行失败';
  if (typeof record.reason === 'string' && record.reason) return String(record.reason);
  return '未知';
}

export function providerTone(value: unknown): StatusTone {
  if (!value || typeof value !== 'object') return 'neutral';
  const record = value as Record<string, unknown>;
  if (record.detected === true) return 'success';
  return typeof record.reason === 'string' && record.reason ? 'warning' : 'neutral';
}

export function statusDotClassName(tone: StatusTone): string {
  if (tone === 'success') return 'status-dot-success';
  if (tone === 'warning') return 'status-dot-warning';
  return 'status-dot-neutral';
}

export function sessionDotTone(session: CurrentSessionView | null): StatusTone {
  if (!session) return 'neutral';
  if (session.status === 'running' || session.status === 'active') return 'success';
  if (session.status === 'error' || session.status === 'failed') return 'warning';
  return 'neutral';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/web/statusFormat.test.ts`
Expected: PASS（3 个用例全过）

- [ ] **Step 5: 提交**

```bash
git add src/web/statusFormat.ts tests/web/statusFormat.test.ts
git commit -m "refactor: 抽出共享状态格式化模块 statusFormat"
```

---

## Task 2: 新增驾驶舱展示组件 `Cockpit.tsx`

**Files:**
- Create: `src/web/Cockpit.tsx`
- Test: `tests/web/cockpit.test.tsx`

`ChannelStrip` 渲染规则（与现有 `WeChatPanel` 行为对齐，便于保留既有测试文案）：
- 始终显示状态点 + `微信通道` + 连接状态徽章。
- `gateway`（runtimeConfig.baseUrl）存在即显示，标签文案 `网关`（**不**按连接态门控）。
- `activeUser` 存在即显示，标签文案 `当前活跃用户`（**不**按连接态门控）。
- 右侧操作：`plugin.enabled` 为真时显示"断开"按钮（点击 `onDisconnect`）；否则显示登录按钮（点击 `onLogin`，文案按 loginState/status 切换）。

`EngineBays` 渲染规则：
- 渲染两个 `EngineBay`：Claude（providerId 判定 `claude-code`）与 Codex（`codex`）。
- 活跃判定：`currentSession` 存在且 `isPluginConnected(plugin)` 为真时，按 `currentSession.providerId === 'codex'` 决定哪个引擎活跃；否则无活跃引擎。
- 活跃引擎排在渲染顺序最前（移动端纵向堆叠时活跃舱在上），桌面端用 CSS 保持左右布局。

- [ ] **Step 1: 写失败测试**

创建 `tests/web/cockpit.test.tsx`：

```tsx
/** @vitest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelStrip, EngineBays } from '../../src/web/Cockpit';
import type { ChannelPluginView, CurrentSessionView } from '../../src/web/apiClient';

const connectedPlugin: ChannelPluginView = {
  id: 'weixin', type: 'weixin', name: '微信通道',
  enabled: true, connected: true, status: 'connected', activeUsers: 1, hasToken: true,
};

const claudeSession: CurrentSessionView = {
  id: 's1', chatId: 'c1', ownerUserId: 'u1', providerId: 'claude-code',
  providerSessionId: 'sess_8f3a', cwd: '/home/me/proj', status: 'running',
  createdAt: 1700000000000, lastActivityAt: 1700000600000,
} as CurrentSessionView;

describe('ChannelStrip', () => {
  it('shows gateway and active user labels and a disconnect action when enabled', () => {
    const onDisconnect = vi.fn();
    render(
      <ChannelStrip
        plugin={connectedPlugin}
        activeUser={{ id: 'u1', platform: 'weixin', platformUserId: 'wx1', displayName: '张三', role: 'user', createdAt: 1 }}
        gateway="https://gw.example.io"
        busy={false}
        loginState="connected"
        onLogin={vi.fn()}
        onDisconnect={onDisconnect}
      />,
    );
    expect(screen.getByText('微信通道')).toBeTruthy();
    expect(screen.getByText('已连接')).toBeTruthy();
    expect(screen.getByText('网关')).toBeTruthy();
    expect(screen.getByText('当前活跃用户')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '断开连接' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('shows a login button when not enabled', () => {
    render(
      <ChannelStrip
        plugin={null} activeUser={null} gateway={undefined}
        busy={false} loginState="idle" onLogin={vi.fn()} onDisconnect={vi.fn()}
      />,
    );
    expect(screen.getByText('未连接')).toBeTruthy();
    expect(screen.getByRole('button', { name: '扫码登录' })).toBeTruthy();
  });
});

describe('EngineBays', () => {
  it('highlights the active engine with session detail and keeps the other on standby', () => {
    render(
      <EngineBays
        providerStatus={{
          claude: { detected: true, version: '2.0.1', command: '/opt/bin/claude' },
          codex: { detected: false, reason: 'missing_binary', command: '/opt/bin/codex' },
        }}
        plugin={connectedPlugin}
        currentSession={claudeSession}
      />,
    );
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('v2.0.1')).toBeTruthy();
    expect(screen.getByText('未找到可执行文件')).toBeTruthy();
    expect(screen.getByText('/opt/bin/claude')).toBeTruthy();
    expect(screen.getByText('当前会话')).toBeTruthy();
    expect(screen.getByText('sess_8f3a')).toBeTruthy();
    expect(screen.getByText('/home/me/proj')).toBeTruthy();
    expect(screen.getByText('待命')).toBeTruthy();
  });

  it('shows both engines on standby when not connected', () => {
    render(
      <EngineBays
        providerStatus={{ claude: { detected: true, version: '2.0.1' }, codex: { detected: true, version: '0.9.0' } }}
        plugin={{ ...connectedPlugin, enabled: false, connected: false }}
        currentSession={claudeSession}
      />,
    );
    expect(screen.queryByText('当前会话')).toBeNull();
    expect(screen.getAllByText('待命').length).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm exec vitest run tests/web/cockpit.test.tsx`
Expected: FAIL（找不到模块 `src/web/Cockpit`）

- [ ] **Step 3: 创建 `src/web/Cockpit.tsx`**

```tsx
import type { ChannelPluginView, CurrentSessionView, ActiveWeChatUserView, ProviderStatusView } from './apiClient';
import {
  ELLIPSIS,
  formatPluginBadge,
  formatPluginBadgeClass,
  formatProviderStatus,
  formatSessionStatusBadgeClass,
  formatTimestamp,
  isPluginConnected,
  providerTone,
  readProviderCommand,
  sessionDotTone,
  statusDotClassName,
} from './statusFormat';

type LoginState = 'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected';

export function ChannelStrip(input: {
  plugin: ChannelPluginView | null;
  activeUser: ActiveWeChatUserView | null;
  gateway?: string;
  busy: boolean;
  loginState: LoginState;
  onLogin(): void;
  onDisconnect(): void;
}) {
  const connected = isPluginConnected(input.plugin);
  const dotTone = connected ? 'success' : 'neutral';
  const loginLabel = input.loginState === 'loading_qr'
    ? '正在加载二维码...'
    : input.plugin?.status === 'session_timeout' ? '重新扫码登录' : '扫码登录';

  return (
    <div className="soft-card channel-strip mb-2">
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <span className={`status-dot ${statusDotClassName(dotTone)}`} />
        <span className="fw-semibold">微信通道</span>
        <span className={`badge ${formatPluginBadgeClass(input.plugin)}`}>{formatPluginBadge(input.plugin)}</span>
        {input.activeUser ? (
          <span className="channel-meta d-flex align-items-center gap-1">
            <span className="text-muted-soft small">当前活跃用户</span>
            <span className="small" style={ELLIPSIS} title={input.activeUser.displayName ?? input.activeUser.platformUserId}>
              {input.activeUser.displayName ?? input.activeUser.platformUserId}
            </span>
          </span>
        ) : null}
        {input.gateway ? (
          <span className="channel-meta d-flex align-items-center gap-1" style={{ minWidth: 0 }}>
            <span className="text-muted-soft small">网关</span>
            <span className="font-monospace text-muted-soft small" style={{ ...ELLIPSIS, maxWidth: 220 }} title={input.gateway}>
              {input.gateway}
            </span>
          </span>
        ) : null}
        <span className="ms-auto">
          {input.plugin?.enabled ? (
            <button className="btn btn-sm btn-outline-danger" disabled={input.busy} onClick={input.onDisconnect} type="button">
              {input.busy ? '断开中...' : '断开连接'}
            </button>
          ) : (
            <button className="btn btn-sm btn-accent" disabled={input.loginState === 'loading_qr'} onClick={input.onLogin} type="button">
              {loginLabel}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function EngineBay(input: {
  name: string;
  providerInfo: unknown;
  active: boolean;
  session: CurrentSessionView | null;
}) {
  const tone = input.active && input.session ? sessionDotTone(input.session) : providerTone(input.providerInfo);
  const command = readProviderCommand(input.providerInfo);
  return (
    <div className={`soft-card engine-bay ${input.active ? 'engine-bay-active' : ''}`} style={{ padding: 14 }}>
      <div className="d-flex align-items-center gap-2">
        <span className={`status-dot ${statusDotClassName(tone)}`} />
        <span className="fw-semibold" style={{ fontSize: 15 }}>{input.name}</span>
        <span className="badge badge-soft-accent">{formatProviderStatus(input.providerInfo)}</span>
        {input.active && input.session ? (
          <span className={`badge ${formatSessionStatusBadgeClass(input.session.status)} ms-auto`}>
            运行中 · {input.session.status}
          </span>
        ) : (
          <span className="badge badge-soft-neutral ms-auto">待命</span>
        )}
      </div>
      {input.active && input.session ? (
        <div className="engine-session-detail mt-2 pt-2 d-flex flex-column gap-1">
          <div className="text-muted-soft small">当前会话</div>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="text-muted-soft small flex-shrink-0">会话 ID</span>
            <span className="font-monospace small" style={ELLIPSIS} title={input.session.providerSessionId ?? '-'}>
              {input.session.providerSessionId ?? '-'}
            </span>
          </div>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span className="text-muted-soft small flex-shrink-0">工作目录</span>
            <span className="font-monospace small" style={ELLIPSIS} title={input.session.cwd}>{input.session.cwd}</span>
          </div>
          {(input.session.nativeTitle ?? input.session.resumeTitle) ? (
            <div className="d-flex justify-content-between align-items-center gap-3">
              <span className="text-muted-soft small flex-shrink-0">标题</span>
              <span className="small" style={ELLIPSIS} title={input.session.nativeTitle ?? input.session.resumeTitle}>
                {input.session.nativeTitle ?? input.session.resumeTitle}
              </span>
            </div>
          ) : null}
          <div className="text-muted-soft small">
            创建 {formatTimestamp(input.session.createdAt)} · 最后活跃 {formatTimestamp(input.session.lastActivityAt)}
          </div>
        </div>
      ) : (
        command ? (
          <div className="font-monospace text-muted-soft small mt-2" style={ELLIPSIS} title={command}>{command}</div>
        ) : null
      )}
    </div>
  );
}

export function EngineBays(input: {
  providerStatus: ProviderStatusView | null;
  plugin: ChannelPluginView | null;
  currentSession: CurrentSessionView | null;
}) {
  const connected = isPluginConnected(input.plugin);
  const activeProvider = connected && input.currentSession
    ? (input.currentSession.providerId === 'codex' ? 'codex' : 'claude')
    : null;

  const claude = (
    <EngineBay
      key="claude"
      name="Claude"
      providerInfo={input.providerStatus?.claude}
      active={activeProvider === 'claude'}
      session={activeProvider === 'claude' ? input.currentSession : null}
    />
  );
  const codex = (
    <EngineBay
      key="codex"
      name="Codex"
      providerInfo={input.providerStatus?.codex}
      active={activeProvider === 'codex'}
      session={activeProvider === 'codex' ? input.currentSession : null}
    />
  );

  const ordered = activeProvider === 'codex' ? [codex, claude] : [claude, codex];

  return <div className="engine-bays mb-2">{ordered}</div>;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm exec vitest run tests/web/cockpit.test.tsx`
Expected: PASS（4 个用例全过）

- [ ] **Step 5: 提交**

```bash
git add src/web/Cockpit.tsx tests/web/cockpit.test.tsx
git commit -m "feat: 新增驾驶舱展示组件 ChannelStrip 与 EngineBays"
```

---

## Task 3: 在 `WeChatPanel` 顶部接入驾驶舱

**Files:**
- Modify: `src/web/WeChatPanel.tsx`

- [ ] **Step 1: 替换顶部 import 与本地格式化函数**

把 `src/web/WeChatPanel.tsx` 文件顶部（第 1-81 行区间）里**本地定义**的以下函数删除：`isPluginConnected`、`formatPluginBadge`、`formatPluginBadgeClass`、`formatSessionStatusBadgeClass`、`formatProviderLabel`、`formatProviderBadgeClass`、`formatPluginHint`、`formatTimestamp`、以及 `const ELLIPSIS`。改为从 `statusFormat` 引入。

在现有 apiClient import 之后新增：

```tsx
import { ChannelStrip, EngineBays } from './Cockpit';
import {
  ELLIPSIS,
  formatPluginHint,
  formatProviderBadgeClass,
  formatProviderLabel,
  formatSessionStatusBadgeClass,
  formatTimestamp,
  isPluginConnected,
} from './statusFormat';
```

（注意：`formatPluginBadge`/`formatPluginBadgeClass` 删除后若组件正文不再直接引用则不需引入；`QRCodeSVG`、`subscribeBridgeEvents`、`BRIDGE_COMMAND_HELP_*` 等 import 保持不变。）

- [ ] **Step 2: 给组件签名增加 `providerStatus` prop**

把组件签名（约第 83-87 行）改为：

```tsx
export function WeChatPanel(input: {
  providerStatus: ProviderStatusView | null;
  currentSession: CurrentSessionView | null;
  onRefreshCurrentSession?(session: CurrentSessionView | null): void;
  onNotice?(message: string): void;
}) {
```

并在 apiClient import 里补上类型 `ProviderStatusView`（加入现有 `import { ... } from './apiClient'` 列表）。

- [ ] **Step 3: 用驾驶舱替换旧的"微信通道"信息卡**

把 `return (<section>...` 里**第一张 `soft-card`**（当前约第 362-455 行，即从 `<div className="soft-card mb-2">` 到其闭合 `</div>`，含 card-header 的断开按钮、网关/活跃用户/会话详情 `row`、QR 区、登录按钮）整体替换为：

```tsx
      <ChannelStrip
        plugin={plugin}
        activeUser={activeUser}
        gateway={runtimeConfig?.baseUrl}
        busy={busy}
        loginState={loginState}
        onLogin={startQrLogin}
        onDisconnect={() => void disconnect()}
      />

      <EngineBays providerStatus={input.providerStatus} plugin={plugin} currentSession={input.currentSession} />

      {formatPluginHint(plugin) ? (
        <div className="soft-card mb-2"><div className="card-body text-muted-soft small">{formatPluginHint(plugin)}</div></div>
      ) : null}
      {plugin?.lastError ? (
        <div className="soft-card mb-2"><div className="card-body text-muted-soft small">错误：{plugin.lastError}</div></div>
      ) : null}

      {loginState === 'showing_qr' || loginState === 'scanned' ? (
        <div className="soft-card mb-2"><div className="card-body p-3 text-center">
          {qrcodeData ? (
            <div className="border rounded p-3 bg-white d-inline-flex justify-content-center" data-testid="weixin-login-qr">
              <QRCodeSVG value={qrcodeData} size={220} marginSize={2} bgColor="#ffffff" fgColor="#111827" title="微信登录二维码" />
            </div>
          ) : null}
          <p className="text-muted-soft small mt-3 mb-0">{loginState === 'scanned' ? '已扫码，等待确认...' : '请使用微信扫描二维码'}</p>
        </div></div>
      ) : null}
```

说明：会话详情块、网关/活跃用户块、原 card-header 的断开按钮都被驾驶舱取代；提示/错误/QR 区移到驾驶舱下方。`formatProviderBadgeClass`、`formatProviderLabel`、`formatSessionStatusBadgeClass` 仍被 tab 区列表/最近会话使用，保留引入。

- [ ] **Step 4: 类型检查**

Run: `pnpm run typecheck`
Expected: PASS（无未使用变量/缺失类型报错；若报"未使用"，删除对应残留引入或变量）

- [ ] **Step 5: 提交**

```bash
git add src/web/WeChatPanel.tsx
git commit -m "feat: WeChatPanel 顶部接入驾驶舱并下沉操作面板"
```

---

## Task 4: 精简 `App.tsx`

**Files:**
- Modify: `src/web/App.tsx`

- [ ] **Step 1: 删除 StatusCards 与其专用函数**

删除 `App.tsx` 中：`StatusCards`（约 97-130 行）、`StatusCard`（132-161 行）、`statusDotClassName`（163-167）、`readProviderCommand`（169-173）、`formatProviderStatus`（175-185）、`providerTone`（187-192）、`formatPluginStatus`（194-201）、`formatPluginStatusBadgeClass`（203-208）、`pluginTone`（210-214）、`formatSessionStatus`（216-219）、`sessionTone`（221-226）。即把第 97 行到文件末尾全部删除。

- [ ] **Step 2: 删除 JSX 里的 `<StatusCards .../>` 调用**

删除 `App` 组件 return 中的这一行（约第 79 行）：

```tsx
        <StatusCards providerStatus={providerStatus} plugin={plugin} currentSession={currentSession} />
```

- [ ] **Step 3: 把 providerStatus 传给 WeChatPanel**

把 `<WeChatPanel .../>`（约 87-91 行）改为：

```tsx
        <WeChatPanel
          providerStatus={providerStatus}
          currentSession={currentSession}
          onRefreshCurrentSession={setCurrentSession}
          onNotice={setToast}
        />
```

`plugin` state 仍由 `App` 持有并通过 bridge 事件更新，但不再直接渲染——保留 `plugin`/`setPlugin` 不动（WeChatPanel 自身也维护 plugin，此处保留以便 `channel.plugin-status-changed` 订阅不报未使用）。若 `typecheck` 报 `plugin` 未使用，则在 Step 4 处理。

- [ ] **Step 4: 类型检查并清理未使用**

Run: `pnpm run typecheck`
Expected: PASS。若报 `plugin`/`setPlugin` 未使用：把 App 里 `const [plugin, setPlugin] = useState...`、`setPlugin(nextChannelState.plugin)`、以及 `channel.plugin-status-changed` 的 `setPlugin(payload.status)` 一并删除（WeChatPanel 已独立订阅同一事件）。同时把 `ChannelPluginView` 从 import 中移除。

- [ ] **Step 5: 提交**

```bash
git add src/web/App.tsx
git commit -m "refactor: App 移除四卡 StatusCards，下传 providerStatus 给驾驶舱"
```

---

## Task 5: 驾驶舱样式

**Files:**
- Modify: `src/web/styles.css`

- [ ] **Step 1: 追加样式到 `styles.css` 末尾**

```css
/* ── 驾驶舱：通道条 + 双引擎舱 ── */
.channel-strip {
  padding: 10px 14px;
}

.engine-bays {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: 11px;
}

.engine-bay {
  min-width: 0;
}

.engine-bay-active {
  grid-column: 1;
  border: 1.5px solid var(--accent-bd, var(--soft-warning-border));
  background: linear-gradient(180deg, var(--accent), var(--card) 55%);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--primary) 10%, transparent),
    0 2px 8px color-mix(in oklch, var(--primary) 14%, transparent);
}

.engine-session-detail {
  border-top: 1px dashed var(--border);
}

@media (max-width: 640px) {
  .engine-bays {
    grid-template-columns: 1fr;
  }
}
```

说明：`--accent-bd` 在 :root 未定义时回退到 `--soft-warning-border`；活跃舱靠 grid 在桌面保持左列、移动端单列时按 DOM 顺序（活跃在前）置顶。

- [ ] **Step 2: 视觉校验（手动）**

Run: `pnpm run dev`，浏览器打开本地地址，依次确认：连接态（活跃引擎高亮+会话详情）、未连接态（两舱待命+登录按钮+扫码 QR）、窄屏（DevTools 375px 宽，引擎舱纵向堆叠、活跃在上、无横向溢出）。
Expected: 三种状态均正确，无字段丢失/溢出。若无法运行 UI，明确说明未做可视化验证。

- [ ] **Step 3: 提交**

```bash
git add src/web/styles.css
git commit -m "style: 新增驾驶舱通道条与双引擎舱样式"
```

---

## Task 6: 更新既有测试并跑全量校验

**Files:**
- Modify: `tests/web/appInteractions.test.tsx`

- [ ] **Step 1: 更新对旧"当前会话"卡的断言**

旧"当前会话"独立卡已删除；在未连接的测试 state 下（`tests/web/appInteractions.test.tsx` 第 349-366 "renders a simplified bridge sessions table..." 用例），`当前会话` 文案不再出现（会话详情仅在连接态的活跃引擎舱内显示）。把该用例第 357 行：

```tsx
    expect((await screen.findAllByText('当前会话')).length).toBeGreaterThan(0);
```

替换为（断言驾驶舱待命态：两个引擎舱都显示"待命"）：

```tsx
    expect((await screen.findAllByText('待命')).length).toBe(2);
```

- [ ] **Step 2: 运行受影响的测试文件**

Run: `pnpm exec vitest run tests/web/appInteractions.test.tsx tests/web/appDashboard.test.tsx`
Expected: PASS。
- `appDashboard`：`Claude`/`Codex`/`在线`/`v2.0.1`/`未找到可执行文件`/`/opt/bin/claude`/`/opt/bin/codex` 由引擎舱渲染，断言仍满足（用 `findAllByText`，允许多处）。
- `appInteractions`：`微信通道`/`当前活跃用户`/`网关` 由通道条渲染（未按连接态门控），断言满足；`当前会话` 断言已按 Step 1 更新。

- [ ] **Step 3: 跑全量测试 + 类型检查**

Run: `pnpm run typecheck && pnpm test`
Expected: 全绿。若 `providerDiagnostics.test.tsx` / `sessionLogs.test.tsx` 出现因结构变化的失败，逐条按"信息现由驾驶舱渲染、文案不变"的原则修正断言（不得放宽到删断言以掩盖回归）。

- [ ] **Step 4: 提交**

```bash
git add tests/web/appInteractions.test.tsx
git commit -m "test: 更新驾驶舱重设计后的布局断言"
```

---

## Self-Review 结果

- **Spec 覆盖**：通道条（Task 2/3）、双引擎舱+二选一高亮（Task 2/3）、会话详情上移（Task 2）、面板删重复块（Task 3）、App 删四卡（Task 4）、移动端纵向堆叠活跃在上（Task 5）、状态枚举沿用（Task 1）、测试影响（Task 6）——均有对应任务。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整代码。
- **类型一致性**：`ChannelStrip`/`EngineBays`/`EngineBay` 的 props 名称在 Cockpit.tsx 定义与 WeChatPanel 调用处一致；`statusFormat` 导出名在各处引用一致；`LoginState` 类型与 WeChatPanel 内同名联合类型字面量一致（`'idle' | 'loading_qr' | 'showing_qr' | 'scanned' | 'connected'`）。
- **保留文案**：`微信通道`/`当前活跃用户`/`网关` 文案保留且不按连接态门控，避免无谓的测试回归；`当前会话` 因卡片删除按 Task 6 更新断言。
