#!/usr/bin/env node

/**
 * Postinstall script: register wechat-media MCP server to Codex globally.
 * Runs after `npm install -g claude-codex-wechat`.
 * Idempotent — safe to run multiple times.
 * Silently skips if `codex` is not installed.
 */

import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mediaServerPath = join(here, '..', 'dist', 'mcp', 'mediaServer.js');

try {
  // Check if codex is available
  execSync('codex --version', { stdio: 'ignore' });
} catch {
  // codex not installed, skip silently
  process.exit(0);
}

try {
  // Remove existing (idempotent)
  execSync('codex mcp remove wechat-media', { stdio: 'ignore' });
} catch {
  // didn't exist, fine
}

try {
  execSync(
    `codex mcp add wechat-media --env "BRIDGE_API_URL=http://localhost:8787" -- node "${mediaServerPath}"`,
    { stdio: 'inherit' },
  );
} catch (e) {
  console.warn('[claude-codex-wechat] Failed to register Codex MCP server:', e.message);
}
