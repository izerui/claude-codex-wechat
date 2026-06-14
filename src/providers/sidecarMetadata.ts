import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderId } from './types';
import type { SessionBridgeTag } from '../session/sessionBridgeTag';

export type ProviderSessionSidecar = {
  providerId: ProviderId;
  providerSessionId: string;
  bridgeTag: SessionBridgeTag;
  cwd: string;
  updatedAt: number;
};

function resolveSidecarDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HOME || homedir(), '.claude-codex-wechat', 'provider-sidecar');
}

function resolveSidecarPath(providerId: ProviderId, providerSessionId: string, env: NodeJS.ProcessEnv = process.env): string {
  const safeId = providerSessionId.replace(/[^\w.-]+/g, '_');
  return join(resolveSidecarDir(env), `${providerId}__${safeId}.json`);
}

export async function writeProviderSessionSidecar(input: Omit<ProviderSessionSidecar, 'updatedAt'>, env: NodeJS.ProcessEnv = process.env): Promise<ProviderSessionSidecar> {
  const record: ProviderSessionSidecar = { ...input, updatedAt: Date.now() };
  await mkdir(resolveSidecarDir(env), { recursive: true });
  await writeFile(resolveSidecarPath(input.providerId, input.providerSessionId, env), JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export async function readProviderSessionSidecar(
  providerId: ProviderId,
  providerSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderSessionSidecar | null> {
  try {
    const raw = JSON.parse(await readFile(resolveSidecarPath(providerId, providerSessionId, env), 'utf8')) as Record<string, unknown>;
    if (raw.providerId !== providerId) return null;
    if (typeof raw.providerSessionId !== 'string' || raw.providerSessionId !== providerSessionId) return null;
    if (!raw.bridgeTag || typeof raw.bridgeTag !== 'object') return null;
    const bridgeTag = raw.bridgeTag as Record<string, unknown>;
    if (bridgeTag.platform !== 'weixin') return null;
    if (typeof bridgeTag.platformUserId !== 'string' || typeof bridgeTag.chatId !== 'string') return null;
    if (typeof raw.cwd !== 'string') return null;
    return {
      providerId,
      providerSessionId,
      bridgeTag: {
        platform: 'weixin',
        platformUserId: bridgeTag.platformUserId,
        chatId: bridgeTag.chatId,
      },
      cwd: raw.cwd,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    };
  } catch {
    return null;
  }
}
