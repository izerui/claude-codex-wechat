import { mkdtempSync } from 'node:fs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { createDaemonServer } from '../src/daemon/server';
import { ClaudeHeadlessRunner, type ClaudeProcessRunner } from '../src/providers/claude-code/claudeHeadlessRunner';
import { ClaudeCodeProvider } from '../src/providers/claude-code/claudeProvider';
import { PRIMARY_WEIXIN_PLATFORM } from '../src/channels/platforms';
import { createRuntimeUserStore, seedRuntimeUserStore } from './helpers/runtimeUserStore';

describe('daemon provider session recovery', () => {
  it('resumes the same persisted Claude session after daemon restart', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-daemon-home-`);
    try {
      const store = createRuntimeUserStore('bridge-daemon-recovery-');
      const activeUserStore = store.activeUserStore;
      activeUserStore.setActiveUser({
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: 'wx_user_1',
        role: 'user',
      });

      const firstRunnerCalls: Parameters<ClaudeProcessRunner>[0][] = [];
      const firstRunner = new ClaudeHeadlessRunner({
        command: 'claude',
        processRunner: async (call) => {
          firstRunnerCalls.push(call);
          return {
            code: 0,
            stdout: [
              JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'first reply' }] } }),
              JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
            ].join('\n'),
            stderr: '',
          };
        },
      });
      const firstChannel = new MockChannelAdapter();
      const firstServer = createDaemonServer({
        channel: firstChannel,
        providers: [new ClaudeCodeProvider({ runner: firstRunner })],
        activeUserStore,
        configPath: store.configPath,
      });

      await firstChannel.emitIncoming({
        id: 'm1',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-a',
        user: { id: 'wx_user_1' },
        content: { type: 'text', text: 'first' },
        timestamp: 1,
      });

      const persistedBeforeRestart = JSON.parse(readFileSync(store.configPath, 'utf8'));
      expect(persistedBeforeRestart).toMatchObject({
        bridge: {
          activeWeChatUser: {
            platformUserId: 'wx_user_1',
            currentConversation: {
              chatId: 'chat-a',
              providerId: 'claude-code',
              providerSessionId: 'claude-session-1',
              resumeTitle: 'first',
            },
          },
        },
      });

      await firstServer.app.close();

      const secondRunnerCalls: Parameters<ClaudeProcessRunner>[0][] = [];
      const secondRunner = new ClaudeHeadlessRunner({
        command: 'claude',
        processRunner: async (call) => {
          secondRunnerCalls.push(call);
          return {
            code: 0,
            stdout: [
              JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'second reply' }] } }),
              JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
            ].join('\n'),
            stderr: '',
          };
        },
      });
      const secondChannel = new MockChannelAdapter();
      const secondServer = createDaemonServer({
        channel: secondChannel,
        providers: [new ClaudeCodeProvider({ runner: secondRunner })],
        activeUserStore,
        configPath: store.configPath,
      });

      await secondChannel.emitIncoming({
        id: 'm2',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-a',
        user: { id: 'wx_user_1' },
        content: { type: 'text', text: 'second' },
        timestamp: 2,
      });

      expect(secondRunnerCalls[0]?.args).toEqual([
        '-p',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--dangerously-skip-permissions',
        '--resume',
        'claude-session-1',
        'second',
      ]);
      expect(JSON.parse(readFileSync(store.configPath, 'utf8'))).toMatchObject({
        bridge: {
          activeWeChatUser: {
            currentConversation: {
              providerSessionId: 'claude-session-1',
              resumeTitle: 'first',
            },
          },
        },
      });

      await secondServer.app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('heals legacy persisted WeChat Claude sessions with missing native resume title metadata on restart', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-daemon-home-`);
    try {
      const store = createRuntimeUserStore('bridge-daemon-legacy-');
      const user = seedRuntimeUserStore(store, {
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: 'wx_user_legacy',
        role: 'user',
      });
      const resumeTitle = '微信 · wx_user_legacy · [claude-codex-wechat:legacyprobe]';
      writeFileSync(store.configPath, JSON.stringify({
        bridge: {
          activeWeChatUser: {
            ...user,
            currentConversation: {
              id: 'bs_legacy',
              chatId: 'chat-legacy',
              ownerUserId: user.id,
              providerId: 'claude-code',
              providerSessionId: 'legacy-session-1',
              recoverySource: 'runtime',
              resumeTitle,
              cwd: '/tmp/project',
              status: 'idle',
              createdAt: 1,
              lastActivityAt: 1,
            },
          },
        },
      }, null, 2));

      const projectDir = join(process.env.HOME, '.claude', 'projects', '-tmp-project');
      mkdirSync(projectDir, { recursive: true });
      const sessionPath = join(projectDir, 'legacy-session-1.jsonl');
      writeFileSync(sessionPath, [
        JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'old session' }] } }),
        JSON.stringify({ type: 'result', session_id: 'legacy-session-1' }),
      ].join('\n'));

      const server = createDaemonServer({
        channel: new MockChannelAdapter(),
        providers: [new ClaudeCodeProvider({ runner: new ClaudeHeadlessRunner() })],
        activeUserStore: store.activeUserStore,
        configPath: store.configPath,
      });

      await server.app.ready();

      await vi.waitFor(() => {
        const content = readFileSync(sessionPath, 'utf8');
        expect(content).toContain('"type":"custom-title"');
        expect(content).toContain('"type":"agent-name"');
        expect(content).toContain(resumeTitle);
      });

      await server.app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });

  it('keeps resuming the persisted session even if the restart path re-authorizes the same wechat user', async () => {
    const previousHome = process.env.HOME;
    process.env.HOME = mkdtempSync(`${tmpdir()}/bridge-daemon-home-`);
    try {
      const store = createRuntimeUserStore('bridge-daemon-reauth-');
      const activeUserStore = store.activeUserStore;
      const user = activeUserStore.setActiveUser({
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: 'wx_user_1',
        role: 'user',
        currentConversation: {
          id: 'bs_existing',
          chatId: 'chat-a',
          ownerUserId: 'user_existing',
          providerId: 'claude-code',
          providerSessionId: 'claude-session-1',
          recoverySource: 'runtime',
          resumeTitle: 'first',
          cwd: '/tmp/project',
          status: 'idle',
          createdAt: 1,
          lastActivityAt: 1,
        },
      });

      // Simulate a restart path that re-authorizes the same user before the next inbound turn.
      activeUserStore.setActiveUser({
        platform: PRIMARY_WEIXIN_PLATFORM,
        platformUserId: 'wx_user_1',
        role: 'user',
        displayName: 'Alice',
      });

      const runnerCalls: Parameters<ClaudeProcessRunner>[0][] = [];
      const runner = new ClaudeHeadlessRunner({
        command: 'claude',
        processRunner: async (call) => {
          runnerCalls.push(call);
          return {
            code: 0,
            stdout: [
              JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'reply' }] } }),
              JSON.stringify({ type: 'result', session_id: 'claude-session-1' }),
            ].join('\n'),
            stderr: '',
          };
        },
      });
      const channel = new MockChannelAdapter();
      const server = createDaemonServer({
        channel,
        providers: [new ClaudeCodeProvider({ runner })],
        activeUserStore,
        configPath: store.configPath,
      });

      await channel.emitIncoming({
        id: 'm1',
        platform: PRIMARY_WEIXIN_PLATFORM,
        chatId: 'chat-a',
        user: { id: 'wx_user_1' },
        content: { type: 'text', text: 'second' },
        timestamp: 2,
      });

      expect(runnerCalls[0]?.args).toEqual([
        '-p',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--dangerously-skip-permissions',
        '--resume',
        'claude-session-1',
        'second',
      ]);
      expect(JSON.parse(readFileSync(store.configPath, 'utf8'))).toMatchObject({
        bridge: {
          activeWeChatUser: {
            id: user.id,
            currentConversation: {
              providerSessionId: 'claude-session-1',
              resumeTitle: 'first',
            },
          },
        },
      });

      await server.app.close();
    } finally {
      process.env.HOME = previousHome;
    }
  });
});
