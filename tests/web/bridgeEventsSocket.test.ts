/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn((_url: string, init?: { signal?: AbortSignal }) => new Promise<void>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  })),
}));

import { fetchEventSource } from '@microsoft/fetch-event-source';
import { resetBridgeEventsForTests, subscribeBridgeEvents } from '../../src/web/bridgeEventsSocket';
import { resolveApiBaseUrlForTest } from '../../src/web/apiClient';

describe('bridgeEventsSocket', () => {
  afterEach(() => {
    resetBridgeEventsForTests();
    vi.clearAllMocks();
  });

  it('resets the shared bridge events singleton between tests', () => {
    const unsubscribe = subscribeBridgeEvents(() => undefined);

    expect(fetchEventSource).toHaveBeenCalledTimes(1);

    resetBridgeEventsForTests();
    unsubscribe();

    subscribeBridgeEvents(() => undefined);

    expect(fetchEventSource).toHaveBeenCalledTimes(2);
  });

  it('uses the relay token path prefix for bridge event requests', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        origin: 'http://127.0.0.1:8788',
        pathname: '/f300f2a605ed',
      },
    });

    expect(resolveApiBaseUrlForTest(
      {},
      {
        origin: 'http://127.0.0.1:8788',
        pathname: '/f300f2a605ed',
      },
    )).toBe('http://127.0.0.1:8788/f300f2a605ed');

    subscribeBridgeEvents(() => undefined);

    expect(fetchEventSource).toHaveBeenCalledWith(
      'http://127.0.0.1:8788/f300f2a605ed/api/bridge-events',
      expect.any(Object),
    );
  });
});
