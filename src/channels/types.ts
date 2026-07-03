export type ChannelAttachment = {
  kind: 'image' | 'file' | 'video';
  /** Local path of the downloaded+decrypted file; absent when download failed. */
  localPath?: string;
  fileName?: string;
  mimeType?: string;
  failed?: boolean;
  failReason?: string;
};

export type ChannelIncomingMessage = {
  id: string;
  platform: 'weixin' | 'mock-wechat';
  chatId: string;
  user: {
    id: string;
    displayName?: string;
  };
  content: {
    type: 'text' | 'image' | 'file' | 'video' | 'mixed';
    text?: string;
    /** @deprecated single-file path; prefer `attachments`. Kept for back-compat. */
    localPath?: string;
    attachments?: ChannelAttachment[];
    quoted?: { text?: string; attachments?: ChannelAttachment[] };
  };
  timestamp: number;
  raw?: unknown;
};

export type ChannelOutgoingMessage = {
  chatId: string;
  kind: 'text' | 'markdown' | 'status' | 'image' | 'video' | 'audio' | 'file';
  text: string;
  /** Local file path for media messages (image/video/audio/file). */
  filePath?: string;
  /** Display file name for file-type messages. */
  fileName?: string;
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
  setTyping?(chatId: string, active: boolean): Promise<void>;
  updateMessage?(message: ChannelOutgoingMessage & { platformMessageId: string }): Promise<void>;
  onHealthChange?(listener: () => void): void;
  getHealth?(): {
    connected: boolean;
    status: string;
    lastError?: string;
  };
}
