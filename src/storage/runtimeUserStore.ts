import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { nanoid } from 'nanoid';
import type { ProviderId } from '../providers/types';
import type { ActiveWeChatUserRecord, ActiveWeChatUserStore } from './userStore';

type RuntimeStateFile = {
  bridge?: {
    activeWeChatUser?: ActiveWeChatUserRecord;
  };
};

export class RuntimeUserStore implements ActiveWeChatUserStore {
  constructor(private readonly configPath: string) {}

  setActiveUser(input: Omit<ActiveWeChatUserRecord, 'id' | 'createdAt'>): ActiveWeChatUserRecord {
    const state = this.readState();
    const record: ActiveWeChatUserRecord = {
      ...input,
      id: `user_${nanoid(10)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.bridge = {
      ...(state.bridge ?? {}),
      activeWeChatUser: record,
    };
    this.writeState(state);
    return record;
  }

  isActiveUser(platform: string, platformUserId: string): ActiveWeChatUserRecord | null {
    const activeUser = this.readState().bridge?.activeWeChatUser;
    if (!activeUser) return null;
    return activeUser.platform === platform && activeUser.platformUserId === platformUserId ? activeUser : null;
  }

  getActiveUser(): ActiveWeChatUserRecord | null {
    return this.readState().bridge?.activeWeChatUser ?? null;
  }

  updateActiveUser(platform: string, patch: { provider?: ProviderId; cwd?: string }): void {
    const state = this.readState();
    const activeUser = state.bridge?.activeWeChatUser;
    if (!activeUser || activeUser.platform !== platform) return;
    state.bridge = {
      ...(state.bridge ?? {}),
      activeWeChatUser: {
        ...activeUser,
        ...(patch.provider ? { provider: patch.provider } : {}),
        ...(patch.cwd ? { cwd: patch.cwd } : {}),
        updatedAt: Date.now(),
      },
    };
    this.writeState(state);
  }

  clearActiveUser(id: string): { ok: true } | { ok: false; error: string } {
    const state = this.readState();
    const activeUser = state.bridge?.activeWeChatUser;
    if (!activeUser || activeUser.id !== id) return { ok: false, error: 'user_not_found' };
    state.bridge = {
      ...(state.bridge ?? {}),
      activeWeChatUser: undefined,
    };
    this.writeState(state);
    return { ok: true };
  }

  private readState(): RuntimeStateFile {
    if (!existsSync(this.configPath)) return {};
    const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as RuntimeStateFile;
    return raw && typeof raw === 'object' ? raw : {};
  }

  private writeState(state: RuntimeStateFile): void {
    mkdirSync(dirname(this.configPath), { recursive: true });
    writeFileSync(this.configPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }
}
