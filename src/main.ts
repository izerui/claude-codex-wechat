import { createDaemonServer } from './daemon/server';
import { defaultConfigPath, loadBridgeConfig } from './daemon/config';
import { persistProviderCommandsToConfigFile } from './daemon/configPersistence';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
const configPath = process.env.BRIDGE_CONFIG ?? defaultConfigPath();
const config = loadBridgeConfig(configPath);
const providerCommands = await resolveProviderCommands(config.providers);
await persistProviderCommandsToConfigFile({
  configPath,
  providers: providerCommands,
});
const { app } = createDaemonServer({
  wechat: config.wechat,
  providerCommands,
  bridgeDefaults: {
    defaultProvider: config.bridge?.defaultProvider ?? 'claude-code',
    defaultWorkspace: config.bridge?.defaultWorkspace ?? process.cwd(),
  },
  configPath,
});

await app.listen({ host: '127.0.0.1', port });
console.log(`claude-codex-wechat listening on http://127.0.0.1:${port}`);
console.log(`config path: ${configPath}`);

async function resolveProviderCommands(
  providers: ReturnType<typeof loadBridgeConfig>['providers'] | undefined,
): Promise<ReturnType<typeof loadBridgeConfig>['providers']> {
  const claudeCommand = providers?.claude?.command ?? await resolveCommandPath('claude');
  const codexCommand = providers?.codex?.command ?? await resolveCommandPath('codex');
  if (!claudeCommand && !codexCommand) return undefined;
  return {
    ...(claudeCommand ? { claude: { command: claudeCommand } } : {}),
    ...(codexCommand ? { codex: { command: codexCommand } } : {}),
  };
}

async function resolveCommandPath(command: string): Promise<string | undefined> {
  try {
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync('command', ['-v', command], { shell: '/bin/zsh' });
    const resolved = stdout.trim();
    return resolved || undefined;
  } catch {
    return undefined;
  }
}
