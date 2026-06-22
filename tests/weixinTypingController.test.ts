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
}> = {}): TypingControllerDeps {
  const getConfig: GetConfig = overrides.getConfig ?? vi.fn(async () => ({ typingTicket: 'ticket_1' }));
  const sendTyping: SendTyping = overrides.sendTyping ?? vi.fn(async () => {});
  return {
    getConfig,
    sendTyping,
    getContextToken: overrides.getContextToken ?? (() => 'ctx_1'),
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

  it('swallows a failed stop without retrying', async () => {
    const getConfig = vi.fn()
      .mockResolvedValueOnce({ typingTicket: 'ticket_stale' });
    const sendTyping = vi.fn(async ({ status, typingTicket }: SendTypingInput) => {
      if (status === 2 && typingTicket === 'ticket_stale') throw new Error('invalid_typing_ticket');
    });
    const ctrl = new TypingController(makeDeps({ getConfig, sendTyping }));

    await ctrl.set('user_a', true);
    await ctrl.set('user_a', false);

    expect(getConfig).toHaveBeenCalledTimes(1);
    expect(sendTyping).toHaveBeenCalledTimes(2);
    ctrl.dispose();
  });

  it('dispose() stops any further typing writes', async () => {
    const sendTyping = vi.fn().mockResolvedValue(undefined);
    const ctrl = new TypingController(makeDeps({ sendTyping }));

    ctrl.dispose();
    await ctrl.set('user_a', true);
    await ctrl.set('user_a', false);

    expect(sendTyping).not.toHaveBeenCalled();
  });
});
