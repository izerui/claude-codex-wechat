import type { ChannelAdapter, ChannelIncomingMessage, ChannelMessageHandler, ChannelOutgoingMessage } from '../types';

export class MockChannelAdapter implements ChannelAdapter {
  readonly id = 'mock-wechat';
  private handler: ChannelMessageHandler | null = null;
  private sentHandlers: Array<(message: ChannelOutgoingMessage) => void> = [];
  private typingHandlers: Array<(state: { chatId: string; active: boolean }) => void> = [];

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  onMessage(handler: ChannelMessageHandler): void {
    this.handler = handler;
  }

  onSent(handler: (message: ChannelOutgoingMessage) => void): void {
    this.sentHandlers.push(handler);
  }

  onTyping(handler: (state: { chatId: string; active: boolean }) => void): void {
    this.typingHandlers.push(handler);
  }

  async sendMessage(message: ChannelOutgoingMessage): Promise<void> {
    for (const handler of this.sentHandlers) handler(message);
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    for (const handler of this.typingHandlers) handler({ chatId, active });
  }

  async emitIncoming(message: ChannelIncomingMessage): Promise<void> {
    if (!this.handler) throw new Error('mock_channel_handler_not_registered');
    await this.handler(message);
  }
}
