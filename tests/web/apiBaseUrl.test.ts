import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrlForTest } from '../../src/web/apiClient';

describe('resolveApiBaseUrlForTest', () => {
  it('uses explicit window bridge origin when provided', () => {
    expect(resolveApiBaseUrlForTest({ __bridgeApiOrigin: 'http://127.0.0.1:8787' }, { host: '127.0.0.1:5177' })).toBe('http://127.0.0.1:8787');
  });

  it('falls back to current origin when no bridge origin is injected', () => {
    expect(resolveApiBaseUrlForTest({}, { host: '127.0.0.1:5177', origin: 'http://127.0.0.1:5177' })).toBe('http://127.0.0.1:5177');
  });
});
