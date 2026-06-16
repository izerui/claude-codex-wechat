import type { CurrentConversationBinding } from '../session/currentConversationStore';

export type ActiveWeChatUserRecord = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: 'admin' | 'user';
  createdAt: number;
  updatedAt?: number;
  currentConversation?: CurrentConversationBinding;
};

export type ActiveWeChatUserStore = {
  setActiveUser(input: Omit<ActiveWeChatUserRecord, 'id' | 'createdAt'>): ActiveWeChatUserRecord;
  getActiveUser(): ActiveWeChatUserRecord | null;
  isActiveUser(platform: string, platformUserId: string): ActiveWeChatUserRecord | null;
  updateActiveUser(platform: string, patch: { currentConversation?: CurrentConversationBinding }): void;
  clearActiveUser(id: string): { ok: true } | { ok: false; error: string };
};
