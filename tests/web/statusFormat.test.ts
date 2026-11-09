import { describe, expect, it } from 'vitest';
import {
  formatProviderStatus,
  providerTone,
  readProviderCommand,
  formatPluginBadge,
  isPluginConnected,
  formatSessionStatusBadgeClass,
  formatSessionStatusDisplay,
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

  it('maps a session to one of three states: 未启动 / 回复中 / 就绪', () => {
    expect(formatSessionStatusDisplay({ status: 'starting' })).toMatchObject({ icon: '🕓', label: '未启动' });
    expect(formatSessionStatusDisplay({ status: 'idle' })).toMatchObject({ icon: '🕓', label: '未启动' });
    expect(formatSessionStatusDisplay({ status: 'running' })).toMatchObject({ icon: '🟢', label: '回复中' });
    expect(formatSessionStatusDisplay({ status: 'running', providerSessionId: 's1' })).toMatchObject({ icon: '🟢', label: '回复中' });
    for (const status of ['idle', 'starting', 'errored', 'closed', 'whatever']) {
      expect(formatSessionStatusDisplay({ status, providerSessionId: 's1' })).toMatchObject({ icon: '✅', label: '就绪' });
    }
  });
});
