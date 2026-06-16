import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { nanoid } from 'nanoid';
import type { ProviderId, ProviderSessionStatus } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';

export type CurrentConversationBinding = {
  id: string;
  chatId: string;
  ownerUserId: string;
  providerId: ProviderId;
  providerSessionId?: string;
  recoverySource: 'runtime' | 'manual_attach' | 'binding_table' | 'sidecar' | 'heuristic';
  resumeTitle?: string;
  cwd: string;
  status: ProviderSessionStatus;
  createdAt: number;
  lastActivityAt: number;
};

type RuntimeStateFile = {
  bridge?: {
    activeWeChatUser?: ActiveWeChatUserRecord;
  };
};

export class CurrentConversationStore {
  constructor(
    private readonly configPath: string,
    private readonly defaults: { defaultCwd: string; defaultProviderId: ProviderId },
  ) {}

  getCurrent(): CurrentConversationBinding | null {
    return this.readState().bridge?.activeWeChatUser?.currentConversation ?? null;
  }

  getActiveSession(chatId: string): CurrentConversationBinding | null {
    const current = this.getCurrent();
    return current?.chatId === chatId ? current : null;
  }

  listSessions(): CurrentConversationBinding[] {
    const current = this.getCurrent();
    return current ? [current] : [];
  }

  create(input: {
    chatId: string;
    ownerUserId: string;
    providerId?: ProviderId;
    cwd?: string;
    recoverySource?: CurrentConversationBinding['recoverySource'];
    resumeTitle?: string;
  }): CurrentConversationBinding {
    const now = Date.now();
    const record: CurrentConversationBinding = {
      id: `bs_${nanoid(10)}`,
      chatId: input.chatId,
      ownerUserId: input.ownerUserId,
      providerId: input.providerId ?? this.defaults.defaultProviderId,
      cwd: input.cwd ?? this.defaults.defaultCwd,
      recoverySource: input.recoverySource ?? 'runtime',
      resumeTitle: input.resumeTitle,
      status: 'starting',
      createdAt: now,
      lastActivityAt: now,
    };
    this.writeCurrent(record);
    return record;
  }

  setCurrent(record: CurrentConversationBinding): CurrentConversationBinding {
    this.writeCurrent(record);
    return record;
  }

  update(patch: Partial<Pick<CurrentConversationBinding, 'chatId' | 'providerId' | 'providerSessionId' | 'resumeTitle' | 'cwd' | 'status' | 'lastActivityAt' | 'recoverySource'>>): CurrentConversationBinding | null {
    const existing = this.getCurrent();
    if (!existing) return null;
    const next = { ...existing, ...patch };
    this.writeCurrent(next);
    return next;
  }

  clear(): void {
    const state = this.readState();
    const activeWeChatUser = state.bridge?.activeWeChatUser;
    state.bridge = {
      ...(state.bridge ?? {}),
      activeWeChatUser: activeWeChatUser ? { ...activeWeChatUser, currentConversation: undefined } : undefined,
    };
    this.writeState(state);
  }

  private readState(): RuntimeStateFile {
    if (!existsSync(this.configPath)) return {};
    const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as RuntimeStateFile;
    return raw && typeof raw === 'object' ? raw : {};
  }

  private writeCurrent(record: CurrentConversationBinding): void {
    const state = this.readState();
    const activeWeChatUser = state.bridge?.activeWeChatUser;
    state.bridge = {
      ...(state.bridge ?? {}),
      activeWeChatUser: activeWeChatUser
        ? { ...activeWeChatUser, currentConversation: record }
        : {
            id: `user_${nanoid(10)}`,
            platform: 'weixin',
            platformUserId: record.chatId,
            role: 'user',
            createdAt: record.createdAt,
            updatedAt: record.lastActivityAt,
            currentConversation: record,
          },
    };
    this.writeState(state);
  }

  private writeState(state: RuntimeStateFile): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
}
