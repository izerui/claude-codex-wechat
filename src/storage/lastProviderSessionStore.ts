import { existsSync, readFileSync } from 'node:fs';
import { writeFileAtomicSync } from '../shared/atomicFile';
import type { ProviderId } from '../providers/types';

export type LastProviderSessionRecord = {
  providerSessionId: string;
  cwd: string;
  updatedAt: number;
};

type RuntimeStateFile = {
  bridge?: {
    lastProviderSessions?: Partial<Record<ProviderId, LastProviderSessionRecord>>;
  };
};

export class LastProviderSessionStore {
  constructor(private readonly configPath: string) {}

  get(providerId: ProviderId): LastProviderSessionRecord | null {
    return this.readState().bridge?.lastProviderSessions?.[providerId] ?? null;
  }

  set(providerId: ProviderId, input: Omit<LastProviderSessionRecord, 'updatedAt'>, updatedAt = Date.now()): LastProviderSessionRecord {
    const record: LastProviderSessionRecord = { ...input, updatedAt };
    const state = this.readState();
    state.bridge = {
      ...(state.bridge ?? {}),
      lastProviderSessions: {
        ...(state.bridge?.lastProviderSessions ?? {}),
        [providerId]: record,
      },
    };
    this.writeState(state);
    return record;
  }

  list(): Partial<Record<ProviderId, LastProviderSessionRecord>> {
    return this.readState().bridge?.lastProviderSessions ?? {};
  }

  private readState(): RuntimeStateFile {
    if (!existsSync(this.configPath)) return {};
    const raw = JSON.parse(readFileSync(this.configPath, 'utf8')) as RuntimeStateFile;
    return raw && typeof raw === 'object' ? raw : {};
  }

  private writeState(state: RuntimeStateFile): void {
    writeFileAtomicSync(this.configPath, `${JSON.stringify(state, null, 2)}\n`);
  }
}
