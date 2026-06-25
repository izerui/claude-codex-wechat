import { appendFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { ProviderSessionCandidate } from '../types';
import { parseSessionBridgeName } from '../../session/sessionBridgeTag';

function resolveClaudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HOME || homedir(), '.claude');
}

export async function listRecoverableClaudeSessions(env: NodeJS.ProcessEnv = process.env): Promise<ProviderSessionCandidate[]> {
  const projectsDir = join(resolveClaudeConfigDir(env), 'projects');
  const historyIndex = await readClaudeHistoryIndex(env);
  const candidates: ProviderSessionCandidate[] = [];
  try {
    const projectEntries = await readdir(projectsDir, { withFileTypes: true });
    for (const entry of projectEntries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const projectDir = join(projectsDir, String(entry.name));
      const sessionEntries = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
      for (const sessionEntry of sessionEntries) {
        if (!sessionEntry.isFile() || sessionEntry.isSymbolicLink()) continue;
        const fileName = String(sessionEntry.name);
        if (!fileName.endsWith('.jsonl')) continue;
        const filePath = join(projectDir, fileName);
        const metadata = await stat(filePath).catch(() => null);
        const parsedMeta = await readClaudeSessionMetadata(filePath).catch(() => null);
        const historyMeta = historyIndex.get(basename(fileName, '.jsonl'));
        const sessionId = basename(fileName, '.jsonl');
        const bridgeTag = historyMeta?.bridgeTag ?? parseSessionBridgeName(parsedMeta?.sessionName);
        const cwd = parsedMeta?.cwd ?? historyMeta?.project;
        candidates.push({
          id: sessionId,
          providerId: 'claude-code',
          ...(cwd ? { cwd } : {}),
          ...(parsedMeta?.aiTitle ?? parsedMeta?.lastPrompt
            ? { title: parsedMeta?.aiTitle ?? parsedMeta?.lastPrompt }
            : {}),
          ...(parsedMeta?.sessionName
            ? { resumeTitle: parsedMeta.sessionName }
            : historyMeta?.display
              ? { resumeTitle: historyMeta.display }
              : {}),
          ...(historyMeta?.timestamp
            ? { lastActivityAt: historyMeta.timestamp }
            : metadata
              ? { lastActivityAt: Math.trunc(metadata.mtimeMs) }
              : {}),
          ...(bridgeTag ? { bridgeBindingSource: 'bridge_tag' as const, bridgeTag } : {}),
        });
      }
    }
  } catch {
    return [];
  }

  return candidates.sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
}

export async function findRecoverableClaudeSessionPath(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const trimmed = sessionId.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) return null;
  const projectsDir = join(resolveClaudeConfigDir(env), 'projects');
  try {
    const projectEntries = await readdir(projectsDir, { withFileTypes: true });
    for (const entry of projectEntries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const sessionPath = join(projectsDir, String(entry.name), `${trimmed}.jsonl`);
      try {
        const metadata = await stat(sessionPath);
        if (metadata.isFile()) return sessionPath;
      } catch {
        // Ignore missing project-local session file and continue scanning.
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function ensureClaudeSessionBridgeMetadata(input: {
  sessionId: string;
  resumeTitle: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const env = input.env ?? process.env;
  // The native resume list is backed by history.jsonl, so its display entry must
  // be written even when the session .jsonl has not been flushed to disk yet
  // (the bridge mints the id and persists ahead of the Claude CLI's first write).
  // The file-dependent steps below are best-effort and get retried on a later
  // persist once the file lands.
  const sessionPath = await findRecoverableClaudeSessionPath(input.sessionId, env);
  let changed = false;
  let metadata: Awaited<ReturnType<typeof readClaudeSessionMetadata>> | null = null;
  if (sessionPath) {
    changed = await normalizeClaudeSessionFileForResume(sessionPath);
    metadata = await readClaudeSessionMetadata(sessionPath).catch(() => null);
    if (metadata?.sessionName !== input.resumeTitle) {
      const suffix = [
        JSON.stringify({ type: 'custom-title', customTitle: input.resumeTitle, sessionId: input.sessionId }),
        JSON.stringify({ type: 'agent-name', agentName: input.resumeTitle, sessionId: input.sessionId }),
      ].join('\n');
      const prefix = (await readFile(sessionPath, 'utf8')).endsWith('\n') ? '' : '\n';
      await appendFile(sessionPath, `${prefix}${suffix}\n`, 'utf8');
      changed = true;
    }
  }
  changed = await upsertClaudeHistoryDisplay({
    sessionId: input.sessionId,
    resumeTitle: input.resumeTitle,
    project: input.cwd ?? metadata?.cwd,
    env,
  }) || changed;
  return changed;
}

export async function hasClaudeSessionBridgeMetadata(input: {
  sessionId: string;
  resumeTitle: string;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const env = input.env ?? process.env;
  const sessionPath = await findRecoverableClaudeSessionPath(input.sessionId, env);
  if (!sessionPath) return false;
  const metadata = await readClaudeSessionMetadata(sessionPath).catch(() => null);
  return metadata?.sessionName === input.resumeTitle;
}

export async function hasClaudeHistoryDisplay(input: {
  sessionId: string;
  resumeTitle: string;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const env = input.env ?? process.env;
  const historyPath = join(resolveClaudeConfigDir(env), 'history.jsonl');
  try {
    const content = await readFile(historyPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.sessionId === input.sessionId) {
          return typeof record.display === 'string' && record.display.trim() === input.resumeTitle;
        }
      } catch {
        // Ignore malformed lines and continue scanning.
      }
    }
  } catch {
    return false;
  }
  return false;
}

export async function getClaudeRecoverableSessionById(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProviderSessionCandidate | null> {
  return (await listRecoverableClaudeSessions(env)).find((candidate) => candidate.id === sessionId) ?? null;
}

async function readClaudeSessionMetadata(filePath: string): Promise<{ aiTitle?: string; lastPrompt?: string; sessionName?: string; cwd?: string }> {
  const content = await readFile(filePath, 'utf8');
  let aiTitle: string | undefined;
  let lastPrompt: string | undefined;
  let sessionName: string | undefined;
  let cwd: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (typeof record.cwd === 'string' && record.cwd.trim()) {
        cwd = record.cwd.trim();
      }
      if (record.type === 'ai-title' && typeof record.aiTitle === 'string' && record.aiTitle.trim()) {
        aiTitle = record.aiTitle.trim();
      }
      if (record.type === 'last-prompt' && typeof record.lastPrompt === 'string' && record.lastPrompt.trim()) {
        lastPrompt = record.lastPrompt.trim();
      }
      if (record.type === 'custom-title' && typeof record.customTitle === 'string' && record.customTitle.trim()) {
        sessionName = record.customTitle.trim();
      }
      if (record.type === 'agent-name' && typeof record.agentName === 'string' && record.agentName.trim()) {
        sessionName = record.agentName.trim();
      }
      if (record.type === 'user' && record.message && typeof record.message === 'object') {
        const message = record.message as Record<string, unknown>;
        if (typeof message.sessionName === 'string' && message.sessionName.trim()) {
          sessionName = message.sessionName.trim();
        }
      }
    } catch {
      // Ignore malformed lines and keep scanning for metadata-bearing records.
    }
  }
  return { aiTitle, lastPrompt, sessionName, cwd };
}

async function readClaudeHistoryIndex(env: NodeJS.ProcessEnv): Promise<Map<string, {
  project?: string;
  timestamp?: number;
  display?: string;
  bridgeTag?: { platform: 'weixin'; platformUserId: string; chatId: string };
}>> {
  const historyPath = join(resolveClaudeConfigDir(env), 'history.jsonl');
  const index = new Map<string, {
    project?: string;
    timestamp?: number;
    display?: string;
    bridgeTag?: { platform: 'weixin'; platformUserId: string; chatId: string };
  }>();
  try {
    const content = await readFile(historyPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (typeof record.sessionId !== 'string' || !record.sessionId.trim()) continue;
        const sessionId = record.sessionId.trim();
        const previous = index.get(sessionId);
        const timestamp = typeof record.timestamp === 'number' ? record.timestamp : previous?.timestamp;
        const project = typeof record.project === 'string' && record.project.trim() ? record.project.trim() : previous?.project;
        const display = typeof record.display === 'string' ? record.display.trim() : '';
        const bridgeTag = parseSessionBridgeName(display) ?? previous?.bridgeTag;
        index.set(sessionId, { project, timestamp, display: display || previous?.display, bridgeTag });
      } catch {
        // Ignore malformed history lines and continue scanning.
      }
    }
  } catch {
    return index;
  }
  return index;
}

async function upsertClaudeHistoryDisplay(input: {
  sessionId: string;
  resumeTitle: string;
  project?: string;
  env: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const historyPath = join(resolveClaudeConfigDir(input.env), 'history.jsonl');
  const lines: string[] = [];
  let replaced = false;
  let changed = false;
  try {
    const content = await readFile(historyPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        if (record.sessionId === input.sessionId) {
          replaced = true;
          if (record.display !== input.resumeTitle) changed = true;
          if (typeof record.project !== 'string' && input.project) changed = true;
          lines.push(JSON.stringify({
            ...record,
            display: input.resumeTitle,
            ...(typeof record.project !== 'string' && input.project ? { project: input.project } : {}),
          }));
        } else {
          lines.push(line);
        }
      } catch {
        lines.push(line);
      }
    }
  } catch {
    // Create a fresh history file entry below.
  }

  if (!replaced) {
    changed = true;
    lines.push(JSON.stringify({
      display: input.resumeTitle,
      pastedContents: {},
      timestamp: Date.now(),
      sessionId: input.sessionId,
      ...(input.project ? { project: input.project } : {}),
    }));
  }

  if (!changed) return false;
  await mkdir(dirname(historyPath), { recursive: true });
  await writeFile(historyPath, `${lines.join('\n')}\n`, 'utf8');
  return true;
}

async function normalizeClaudeSessionFileForResume(sessionPath: string): Promise<boolean> {
  const content = await readFile(sessionPath, 'utf8');
  const nextLines: string[] = [];
  let changed = false;
  let hasPermissionMode = false;
  let sawSdkCliEntrypoint = false;

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      if (record.type === 'permission-mode') hasPermissionMode = true;
      if (record.entrypoint === 'sdk-cli') {
        sawSdkCliEntrypoint = true;
        nextLines.push(JSON.stringify({
          ...record,
          entrypoint: 'cli',
        }));
        changed = true;
        continue;
      }
    } catch {
      nextLines.push(line);
      continue;
    }
    nextLines.push(line);
  }

  if (sawSdkCliEntrypoint && !hasPermissionMode) {
    const sessionId = basename(sessionPath, '.jsonl');
    nextLines.unshift(JSON.stringify({
      type: 'permission-mode',
      permissionMode: 'bypassPermissions',
      sessionId,
    }));
    changed = true;
  }

  if (!changed) return false;
  await writeFile(sessionPath, `${nextLines.join('\n')}\n`, 'utf8');
  return true;
}
