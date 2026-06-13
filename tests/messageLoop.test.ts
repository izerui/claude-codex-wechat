import { describe, expect, it } from 'vitest';
import { MockChannelAdapter } from '../src/channels/mock/mockChannelAdapter';
import { FakeProviderAdapter } from '../src/providers/fake/fakeProviderAdapter';

describe('mock channel and fake provider loop', () => {
  it('streams provider text and emits a permission request', async () => {
    const channel = new MockChannelAdapter();
    const provider = new FakeProviderAdapter('claude-code');
    const sent: string[] = [];
    channel.onSent((message) => sent.push(message.text));

    const session = await provider.startSession({ bridgeSessionId: 'bs_1', cwd: '/tmp/project' });
    expect(session.status).toBe('idle');

    for await (const event of provider.sendMessage({ bridgeSessionId: 'bs_1', text: 'run tests' })) {
      if (event.type === 'text_delta') {
        await channel.sendMessage({ chatId: 'chat-a', kind: 'text', text: event.text });
      }
      if (event.type === 'permission_request') {
        await channel.sendMessage({ chatId: 'chat-a', kind: 'permission_request', text: event.request.summary });
      }
    }

    expect(sent).toEqual(['收到：run tests', '允许执行 fake command?']);
  });
});
