#!/usr/bin/env node
import { loadRelayConfig } from '../src/config.mjs';
import { startRelayServer } from '../src/server.mjs';

const config = loadRelayConfig(process.env);
const relay = await startRelayServer(config);
const publicBaseUrl = config.baseDomain
  ? `https://${config.baseDomain}`
  : String(config.relayServerUrl)
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/agent\/?$/, '')
    .replace(/\/+$/, '');
process.stdout.write(`relay-server listening on 127.0.0.1:${relay.port} for ${publicBaseUrl}/<token>\n`);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await relay.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
