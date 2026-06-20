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
