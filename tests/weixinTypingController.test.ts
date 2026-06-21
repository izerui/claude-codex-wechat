import { describe, expect, it, vi } from 'vitest';
import { TypingController } from '../src/channels/weixin-direct/typingController';
import type { TypingControllerDeps } from '../src/channels/weixin-direct/typingController';

type SendTypingInput = { ilinkUserId: string; typingTicket: string; status: 1 | 2 };
type GetConfig = TypingControllerDeps['getConfig'];
type SendTyping = TypingControllerDeps['sendTyping'];

function makeDeps(overrides: Partial<{
  getConfig: GetConfig;
  sendTyping: SendTyping;
  getContextToken: (chatId: string) => string | undefined;
  persistTypingActive: TypingControllerDeps['persistTypingActive'];
  stopBackoffMs: number[];
}> = {}): TypingControllerDeps {
  const getConfig: GetConfig = overrides.getConfig ?? vi.fn(async () => ({ typingTicket: 'ticket_1' }));
  const sendTyping: SendTyping = overrides.sendTyping ?? vi.fn(async () => {});
  const persistTypingActive = overrides.persistTypingActive ?? vi.fn();
  return {
    getConfig,
    sendTyping,
    getContextToken: overrides.getContextToken ?? (() => 'ctx_1'),
    persistTypingActive,
    stopBackoffMs: overrides.stopBackoffMs ?? [5, 5],
  };
}

describe('TypingController', () => {
  it('sends start then stop, fetching the ticket once', async () => {
    const deps = makeDeps();
    const ctrl = new TypingController(deps);

    await ctrl.set('user_a', true);
    await ctrl.set('user_a', false);

    expect(deps.getConfig).toHaveBeenCalledTimes(1);
    expect(deps.sendTyping).toHaveBeenNthCalledWith(1, { ilinkUserId: 'user_a', typingTicket: 'ticket_1', status: 1 });
    expect(deps.sendTyping).toHaveBeenNthCalledWith(2, { ilinkUserId: 'user_a', typingTicket: 'ticket_1', status: 2 });
    ctrl.dispose();
  });

  it('orders writes so a slow start cannot land after a later stop', async () => {
    let releaseStart!: () => void;
    const startGate = new Promise<void>((resolve) => { releaseStart = resolve; });
    const landed: Array<1 | 2> = [];
    const sendTyping = vi.fn(async ({ status }: SendTypingInput) => {
      if (status === 1) await startGate;
      landed.push(status);
    });
    const ctrl = new TypingController(makeDeps({ sendTyping }));

    void ctrl.set('user_a', true);
    const stop = ctrl.set('user_a', false);
    await Promise.resolve();
    releaseStart();
    await stop;

    expect(landed[landed.length - 1]).toBe(2);
    ctrl.dispose();
  });

  it('keeps retrying the stop with a refreshed ticket until it lands', async () => {
    const getConfig = vi.fn()
      .mockResolvedValueOnce({ typingTicket: 'ticket_stale' })
      .mockResolvedValue({ typingTicket: 'ticket_fresh' });
    const sendTyping = vi.fn(async ({ status, typingTicket }: SendTypingInput) => {
      if (status === 2 && typingTicket === 'ticket_stale') throw new Error('invalid_typing_ticket');
    });
    const ctrl = new TypingController(makeDeps({ getConfig, sendTyping }));

    await ctrl.set('user_a', true);
    await ctrl.set('user_a', false);

    await vi.waitFor(() => {
      expect(sendTyping).toHaveBeenCalledWith({ ilinkUserId: 'user_a', typingTicket: 'ticket_fresh', status: 2 });
    });
    ctrl.dispose();
  });

  it('does not silently abandon the stop when the ticket comes back empty', async () => {
    const getConfig = vi.fn()
      .mockResolvedValueOnce({ typingTicket: '' })       // first stop → empty ticket
      .mockResolvedValue({ typingTicket: 'ticket_2' });   // retry → valid
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const ctrl = new TypingController(makeDeps({ getConfig, sendTyping }));

    // A leftover stop with no cached ticket: the empty ticket must be retried, not dropped.
    await ctrl.set('user_a', false);

    await vi.waitFor(() => {
      expect(sendTyping).toHaveBeenCalledWith({ ilinkUserId: 'user_a', typingTicket: 'ticket_2', status: 2 });
    });
    ctrl.dispose();
  });

  it('flush() retries a pending stop immediately', async () => {
    let failStop = true;
    const sendTyping = vi.fn(async ({ status }: SendTypingInput) => {
      if (status === 2 && failStop) throw new Error('boom');
    });
    // Long backoff so only flush() can make the retry land in time.
    const ctrl = new TypingController(makeDeps({ sendTyping, stopBackoffMs: [60_000] }));

    await ctrl.set('user_a', true);
    await ctrl.set('user_a', false);
    await vi.waitFor(() => expect(sendTyping).toHaveBeenCalledWith(expect.objectContaining({ status: 2 })));
    const stopCallsBefore = sendTyping.mock.calls.filter(([c]) => c.status === 2).length;

    failStop = false;
    ctrl.flush('user_a');

    await vi.waitFor(() => {
      const after = sendTyping.mock.calls.filter(([c]) => c.status === 2).length;
      expect(after).toBeGreaterThan(stopCallsBefore);
    });
    ctrl.dispose();
  });

  it('a new start cancels a pending stop retry', async () => {
    const sendTyping = vi.fn(async ({ status }: SendTypingInput) => {
      if (status === 2) throw new Error('boom'); // stop always fails
    });
    const ctrl = new TypingController(makeDeps({ sendTyping, stopBackoffMs: [10] }));

    await ctrl.set('user_a', true);
    await ctrl.set('user_a', false); // schedules a failing retry loop
    await ctrl.set('user_a', true);  // must cancel the pending stop retries

    const stopCalls = () => sendTyping.mock.calls.filter(([c]) => c.status === 2).length;
    const baseline = stopCalls();
    await new Promise((r) => setTimeout(r, 40));
    expect(stopCalls()).toBe(baseline); // no further stop attempts fired
    ctrl.dispose();
  });

  it('reconcilePersisted sends a stop for each leftover chat', async () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const ctrl = new TypingController(makeDeps({ sendTyping }));

    ctrl.reconcilePersisted(['user_a', 'user_b']);

    await vi.waitFor(() => {
      expect(sendTyping).toHaveBeenCalledWith(expect.objectContaining({ ilinkUserId: 'user_a', status: 2 }));
      expect(sendTyping).toHaveBeenCalledWith(expect.objectContaining({ ilinkUserId: 'user_b', status: 2 }));
    });
    ctrl.dispose();
  });

  it('persists active on start and inactive only once the stop is confirmed', async () => {
    const persistTypingActive = vi.fn();
    const ctrl = new TypingController(makeDeps({ persistTypingActive }));

    await ctrl.set('user_a', true);
    await ctrl.set('user_a', true); // keepalive tick — must not re-persist
    expect(persistTypingActive.mock.calls).toEqual([['user_a', true]]);

    await ctrl.set('user_a', false);
    await vi.waitFor(() => {
      expect(persistTypingActive).toHaveBeenCalledWith('user_a', false);
    });
    ctrl.dispose();
  });

  it('dispose() stops any further typing writes', async () => {
    const sendTyping = vi.fn(async ({ status }: SendTypingInput) => {
      if (status === 2) throw new Error('boom');
    });
    const ctrl = new TypingController(makeDeps({ sendTyping, stopBackoffMs: [10] }));

    await ctrl.set('user_a', true);
    await ctrl.set('user_a', false);
    ctrl.dispose();

    const calls = sendTyping.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(sendTyping.mock.calls.length).toBe(calls); // nothing fired after dispose
  });
});
