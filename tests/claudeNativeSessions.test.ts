import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureClaudeSessionBridgeMetadata } from '../src/providers/claude-code/nativeSessions';

const tempDirs: string[] = [];

describe('ensureClaudeSessionBridgeMetadata', () => {
  afterEach(async () => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      await import('node:fs/promises').then(({ rm }) => rm(dir, { recursive: true, force: true }));
    }
  });

  it('appends bridge title metadata for legacy Claude sessions missing a resumable title', async () => {
    const home = await mkdtemp(join(tmpdir(), 'claude-native-sessions-'));
    tempDirs.push(home);
    const projectDir = join(home, '.claude', 'projects', '-tmp-project');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
    const sessionId = 'legacy-session-1';
    const sessionPath = join(projectDir, `${sessionId}.jsonl`);
    await writeFile(sessionPath, [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
      JSON.stringify({ type: 'result', session_id: sessionId }),
    ].join('\n'), 'utf8');

    const changed = await ensureClaudeSessionBridgeMetadata({
      sessionId,
      resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:testpayload]',
      env: { HOME: home },
    });

    expect(changed).toBe(true);
    const content = await readFile(sessionPath, 'utf8');
    expect(content).toContain('"type":"custom-title"');
    expect(content).toContain('"type":"agent-name"');
    expect(content).toContain('[claude-codex-wechat:testpayload]');
  });

  it('does not rewrite sessions that already contain bridge resume metadata', async () => {
    const home = await mkdtemp(join(tmpdir(), 'claude-native-sessions-'));
    tempDirs.push(home);
    const projectDir = join(home, '.claude', 'projects', '-tmp-project');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
    const sessionId = 'named-session-1';
    const sessionPath = join(projectDir, `${sessionId}.jsonl`);
    const historyPath = join(home, '.claude', 'history.jsonl');
    const original = [
      JSON.stringify({ type: 'custom-title', customTitle: '微信 · wx_user_1 · [claude-codex-wechat:existing]', sessionId }),
      JSON.stringify({ type: 'agent-name', agentName: '微信 · wx_user_1 · [claude-codex-wechat:existing]', sessionId }),
    ].join('\n');
    await writeFile(sessionPath, original, 'utf8');
    await writeFile(historyPath, JSON.stringify({
      display: '微信 · wx_user_1 · [claude-codex-wechat:existing]',
      timestamp: 1710000000000,
      project: '/tmp/project',
      sessionId,
    }), 'utf8');

    const changed = await ensureClaudeSessionBridgeMetadata({
      sessionId,
      resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:existing]',
      env: { HOME: home },
    });

    expect(changed).toBe(false);
    expect(await readFile(sessionPath, 'utf8')).toBe(original);
  });

  it('updates Claude history display so claude -r can find the bridge title', async () => {
    const home = await mkdtemp(join(tmpdir(), 'claude-native-sessions-'));
    tempDirs.push(home);
    const projectDir = join(home, '.claude', 'projects', '-tmp-project');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
    const sessionId = 'history-session-1';
    const sessionPath = join(projectDir, `${sessionId}.jsonl`);
    const historyPath = join(home, '.claude', 'history.jsonl');
    const resumeTitle = '微信 · wx_user_1 · [claude-codex-wechat:historyprobe]';
    await writeFile(sessionPath, [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
      JSON.stringify({ type: 'result', session_id: sessionId }),
    ].join('\n'), 'utf8');
    await writeFile(historyPath, [
      JSON.stringify({
        display: '旧标题',
        timestamp: 1710000000000,
        project: '/tmp/project',
        sessionId,
      }),
    ].join('\n'), 'utf8');

    await ensureClaudeSessionBridgeMetadata({
      sessionId,
      resumeTitle,
      env: { HOME: home },
    });

    const history = await readFile(historyPath, 'utf8');
    expect(history).toContain(`"display":"${resumeTitle}"`);
    expect(history).not.toContain('"display":"旧标题"');
  });

  it('backfills Claude history project from the session file cwd field, preserving hyphenated paths', async () => {
    const home = await mkdtemp(join(tmpdir(), 'claude-native-sessions-'));
    tempDirs.push(home);
    const projectDir = join(home, '.claude', 'projects', '-tmp-claude-codex-wechat');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
    const sessionId = 'history-project-missing';
    const sessionPath = join(projectDir, `${sessionId}.jsonl`);
    const historyPath = join(home, '.claude', 'history.jsonl');
    const resumeTitle = '微信 · wx_user_1 · [claude-codex-wechat:history-project-missing]';
    await writeFile(sessionPath, [
      JSON.stringify({ type: 'user', cwd: '/tmp/claude-codex-wechat', message: { content: [{ type: 'text', text: 'hi' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
      JSON.stringify({ type: 'result', session_id: sessionId }),
    ].join('\n'), 'utf8');
    await writeFile(historyPath, JSON.stringify({
      display: '旧标题',
      timestamp: 1710000000000,
      sessionId,
    }), 'utf8');

    await ensureClaudeSessionBridgeMetadata({
      sessionId,
      resumeTitle,
      env: { HOME: home },
    });

    const history = await readFile(historyPath, 'utf8');
    expect(history).toContain(`"display":"${resumeTitle}"`);
    expect(history).toContain(`"project":"/tmp/claude-codex-wechat"`);
  });

  it('writes Claude history display even when the session .jsonl has not been flushed yet', async () => {
    const home = await mkdtemp(join(tmpdir(), 'claude-native-sessions-'));
    tempDirs.push(home);
    // Bridge mints the session id and persists metadata as soon as it learns the
    // id, which can race ahead of the Claude CLI flushing the projects .jsonl. The
    // native resume list is backed by history.jsonl, so the display entry must be
    // written regardless of whether the session file exists yet.
    await import('node:fs/promises').then(({ mkdir }) => mkdir(join(home, '.claude'), { recursive: true }));
    const sessionId = 'not-flushed-yet-1';
    const resumeTitle = '微信会话 · 图片';

    const changed = await ensureClaudeSessionBridgeMetadata({
      sessionId,
      resumeTitle,
      cwd: '/tmp/claude-codex-wechat',
      env: { HOME: home },
    });

    expect(changed).toBe(true);
    const history = await readFile(join(home, '.claude', 'history.jsonl'), 'utf8');
    expect(history).toContain(`"sessionId":"${sessionId}"`);
    expect(history).toContain(`"display":"${resumeTitle}"`);
    expect(history).toContain(`"project":"/tmp/claude-codex-wechat"`);
  });

  it('normalizes bridge-created Claude session files so resume UI can treat them like cli sessions', async () => {
    const home = await mkdtemp(join(tmpdir(), 'claude-native-sessions-'));
    tempDirs.push(home);
    const projectDir = join(home, '.claude', 'projects', '-tmp-project');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(projectDir, { recursive: true }));
    const sessionId = 'sdk-session-1';
    const sessionPath = join(projectDir, `${sessionId}.jsonl`);
    await writeFile(sessionPath, [
      JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        type: 'user',
        message: { role: 'user', content: 'hello' },
        userType: 'external',
        entrypoint: 'sdk-cli',
        cwd: '/tmp/project',
        sessionId,
      }),
      JSON.stringify({
        type: 'custom-title',
        customTitle: '微信 · wx_user_1 · [claude-codex-wechat:sdk-session-1]',
        sessionId,
      }),
    ].join('\n'), 'utf8');

    await ensureClaudeSessionBridgeMetadata({
      sessionId,
      resumeTitle: '微信 · wx_user_1 · [claude-codex-wechat:sdk-session-1]',
      env: { HOME: home },
    });

    const content = await readFile(sessionPath, 'utf8');
    expect(content).toContain('"entrypoint":"cli"');
    expect(content).toContain('"type":"permission-mode"');
    expect(content).not.toContain('"entrypoint":"sdk-cli"');
  });
});
