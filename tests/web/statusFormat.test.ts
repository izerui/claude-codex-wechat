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

  it('maps session status to icon + label', () => {
    expect(formatSessionStatusDisplay('running')).toMatchObject({ icon: '🟢', label: '运行中' });
    expect(formatSessionStatusDisplay('idle')).toMatchObject({ icon: '✅', label: '就绪' });
    expect(formatSessionStatusDisplay('starting')).toMatchObject({ icon: '⏳', label: '启动中' });
    expect(formatSessionStatusDisplay('failed')).toMatchObject({ icon: '❌', label: '异常' });
    expect(formatSessionStatusDisplay('whatever')).toMatchObject({ icon: '🟡', label: 'whatever' });
  });
});
