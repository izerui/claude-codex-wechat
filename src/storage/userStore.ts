import type { ProviderId } from '../providers/types';

export type ActiveWeChatUserRecord = {
  id: string;
  platform: string;
  platformUserId: string;
  displayName?: string;
  role: 'admin' | 'user';
  provider: ProviderId;
  cwd: string;
  createdAt: number;
  updatedAt?: number;
};

export type ActiveWeChatUserStore = {
  setActiveUser(input: Omit<ActiveWeChatUserRecord, 'id' | 'createdAt'>): ActiveWeChatUserRecord;
  getActiveUser(): ActiveWeChatUserRecord | null;
  isActiveUser(platform: string, platformUserId: string): ActiveWeChatUserRecord | null;
  updateActiveUser(platform: string, patch: { provider?: ProviderId; cwd?: string }): void;
  clearActiveUser(id: string): { ok: true } | { ok: false; error: string };
};
