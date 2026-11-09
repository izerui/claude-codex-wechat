import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomicSync } from '../shared/atomicFile';
import { nanoid } from 'nanoid';
import type { ProviderId, ProviderSessionStatus } from '../providers/types';
import type { ActiveWeChatUserRecord } from '../storage/userStore';
import { expandTilde } from '../shared/expandTilde';

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
  lastSeenNativeFingerprint?: string;
  lastReloadedAt?: number;
  staleReason?: 'native_advanced_elsewhere';
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

  // daemon 启动时调用：上次进程退出时可能停在「回复中 / 启动中」，而 provider 子进程已随之结束，
  // 原样显示会让控制台一直挂着旧状态。统一改回 idle，会话 ID 保留，下条消息照常续上。
  resetInterruptedStatus(): void {
    const current = this.getCurrent();
    if (current && (current.status === 'running' || current.status === 'starting')) {
      this.writeCurrent({ ...current, status: 'idle' });
    }
  }

  setCurrent(record: CurrentConversationBinding): CurrentConversationBinding {
    this.writeCurrent(record);
    return record;
  }

  update(
    patch: Partial<Pick<
      CurrentConversationBinding,
      'chatId' | 'providerId' | 'providerSessionId' | 'resumeTitle' | 'cwd' | 'status' |
      'lastActivityAt' | 'recoverySource' | 'lastSeenNativeFingerprint' | 'lastReloadedAt' | 'staleReason'
    >>,
    expectId?: string,
  ): CurrentConversationBinding | null {
    const existing = this.getCurrent();
    if (!existing) return null;
    // 带 expectId 时只更新匹配的会话：被命令抢占（current 已换走）的旧生成写入直接 no-op。
    if (expectId && existing.id !== expectId) return null;
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
    // 持久化前统一展开 cwd 的 `~`,确保存进配置的就是绝对路径,
    // 后续 spawn 直接可用(避免字面 `~` 触发 ENOENT)。
    const normalized: CurrentConversationBinding = { ...record, cwd: expandTilde(record.cwd) ?? record.cwd };
    const state = this.readState();
    const activeWeChatUser = state.bridge?.activeWeChatUser;
    state.bridge = {
      ...(state.bridge ?? {}),
      activeWeChatUser: activeWeChatUser
        ? { ...activeWeChatUser, currentConversation: normalized }
        : {
            id: `user_${nanoid(10)}`,
            platform: 'weixin',
            platformUserId: normalized.chatId,
            role: 'user',
            createdAt: normalized.createdAt,
            updatedAt: normalized.lastActivityAt,
            currentConversation: normalized,
          },
    };
    this.writeState(state);
  }

  private writeState(state: RuntimeStateFile): void {
    writeFileAtomicSync(this.configPath, `${JSON.stringify(state, null, 2)}\n`);
  }
}
