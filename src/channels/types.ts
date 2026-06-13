export type ChannelIncomingMessage = {
  id: string;
  platform: 'weixin' | 'mock-wechat';
  chatId: string;
  user: {
    id: string;
    displayName?: string;
  };
  content: {
    type: 'text' | 'image' | 'file';
    text?: string;
    localPath?: string;
  };
  timestamp: number;
  raw?: unknown;
};

export type ChannelOutgoingMessage = {
  chatId: string;
  kind: 'text' | 'markdown' | 'permission_request' | 'status';
  text: string;
  streamId?: string;
  buttons?: Array<{
    id: string;
    label: string;
    command: string;
  }>;
};

export type ChannelMessageHandler = (message: ChannelIncomingMessage) => Promise<void>;

export type ChannelStartOptions = {
  background?: boolean;
};

export interface ChannelAdapter {
  id: string;
  start(options?: ChannelStartOptions): Promise<void>;
  stop(): Promise<void>;
  onMessage(handler: ChannelMessageHandler): void;
  sendMessage(message: ChannelOutgoingMessage): Promise<void>;
  updateMessage?(message: ChannelOutgoingMessage & { platformMessageId: string }): Promise<void>;
}
