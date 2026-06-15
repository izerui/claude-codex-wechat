import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeUserStore } from '../../src/storage/runtimeUserStore';
import type { ActiveWeChatUserRecord } from '../../src/storage/userStore';

export function createRuntimeUserStore(prefix = 'bridge-active-wechat-user-') {
  const configDir = mkdtempSync(join(tmpdir(), prefix));
  const configPath = join(configDir, 'config.json');
  return {
    configPath,
    activeUserStore: new RuntimeUserStore(configPath),
  };
}

export function seedRuntimeUserStore(
  input: ReturnType<typeof createRuntimeUserStore>,
  user: Omit<ActiveWeChatUserRecord, 'id' | 'createdAt'>,
) {
  return input.activeUserStore.setActiveUser(user);
}
