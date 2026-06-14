import { createDaemonServer } from './daemon/server';
import { defaultConfigPath, loadBridgeConfig } from './daemon/config';
import { openBridgeDatabase } from './storage/db';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
const config = loadBridgeConfig();
const db = config.databasePath ? openBridgeDatabase(config.databasePath) : undefined;
const { app } = createDaemonServer({ db, wechat: config.wechat, providerCommands: config.providers });

await app.listen({ host: '127.0.0.1', port });
console.log(`claude-codex-wechat listening on http://127.0.0.1:${port}`);
console.log(`config path: ${process.env.BRIDGE_CONFIG ?? defaultConfigPath()}`);
