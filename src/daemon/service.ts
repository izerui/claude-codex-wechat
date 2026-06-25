import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createReadStream } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ServiceManager = 'launchd' | 'systemd-user';

export type ServiceStatus = {
  manager: ServiceManager;
  installed: boolean;
  running: boolean;
  serviceFilePath: string;
  label: string;
  stdoutPath: string;
  stderrPath: string;
};

export type ServiceContext = {
  cliEntrypointPath: string;
  nodePath?: string;
  configPath?: string;
  port?: number;
};

export async function installService(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    await mkdir(dirname(spec.plistPath), { recursive: true });
    await mkdir(dirname(spec.stdoutPath), { recursive: true });
    await writeFile(spec.plistPath, renderLaunchdPlist(spec), 'utf8');
    await runLaunchctl(['unload', spec.plistPath]).catch(() => undefined);
    await runLaunchctl(['load', spec.plistPath]);
    await runLaunchctl(['kickstart', '-k', `gui/${process.getuid?.() ?? 0}/${spec.label}`]);
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    await mkdir(dirname(spec.unitPath), { recursive: true });
    await mkdir(dirname(spec.stdoutPath), { recursive: true });
    await writeFile(spec.unitPath, renderSystemdUnit(spec), 'utf8');
    await runSystemctl(['--user', 'daemon-reload']);
    await runSystemctl(['--user', 'enable', '--now', spec.unitName]);
    return await readServiceStatus(context);
  }

  throw new Error('service_install_not_supported_on_this_platform');
}

export async function startService(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    await ensureFileExists(spec.plistPath, 'service_not_installed');
    await runLaunchctl(['load', spec.plistPath]).catch(() => undefined);
    await runLaunchctl(['kickstart', '-k', `gui/${process.getuid?.() ?? 0}/${spec.label}`]);
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    await ensureFileExists(spec.unitPath, 'service_not_installed');
    await runSystemctl(['--user', 'start', spec.unitName]);
    return await readServiceStatus(context);
  }

  throw new Error('service_start_not_supported_on_this_platform');
}

export async function stopService(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    if (!existsSync(spec.plistPath)) return await readServiceStatus(context);
    await runLaunchctl(['bootout', `gui/${process.getuid?.() ?? 0}`, spec.plistPath]).catch(() => undefined);
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    if (!existsSync(spec.unitPath)) return await readServiceStatus(context);
    await runSystemctl(['--user', 'stop', spec.unitName]).catch(() => undefined);
    return await readServiceStatus(context);
  }

  throw new Error('service_stop_not_supported_on_this_platform');
}

export async function uninstallService(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    if (existsSync(spec.plistPath)) {
      await runLaunchctl(['bootout', `gui/${process.getuid?.() ?? 0}`, spec.plistPath]).catch(() => undefined);
      await rm(spec.plistPath, { force: true });
    }
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    if (existsSync(spec.unitPath)) {
      await runSystemctl(['--user', 'disable', '--now', spec.unitName]).catch(() => undefined);
      await rm(spec.unitPath, { force: true });
      await runSystemctl(['--user', 'daemon-reload']).catch(() => undefined);
    }
    return await readServiceStatus(context);
  }

  throw new Error('service_uninstall_not_supported_on_this_platform');
}

export async function restartService(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    await ensureFileExists(spec.plistPath, 'service_not_installed');
    await runLaunchctl(['kickstart', '-k', `gui/${process.getuid?.() ?? 0}/${spec.label}`]);
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    await ensureFileExists(spec.unitPath, 'service_not_installed');
    await runSystemctl(['--user', 'restart', spec.unitName]);
    return await readServiceStatus(context);
  }

  throw new Error('service_restart_not_supported_on_this_platform');
}

export async function readServiceLogs(context: ServiceContext, lines = 120): Promise<string> {
  const status = await readServiceStatus(context);
  const stdoutTail = await tailFile(status.stdoutPath, lines);
  const stderrTail = await tailFile(status.stderrPath, lines);
  return [
    `[stdout] ${status.stdoutPath}`,
    stdoutTail || '(empty)',
    '',
    `[stderr] ${status.stderrPath}`,
    stderrTail || '(empty)',
  ].join('\n');
}

export async function tailServiceLogs(context: ServiceContext): Promise<void> {
  const status = await readServiceStatus(context);
  await tailFiles([status.stdoutPath, status.stderrPath]);
}

export async function readServiceStatus(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    const installed = existsSync(spec.plistPath);
    const running = installed
      ? await runLaunchctl(['print', `gui/${process.getuid?.() ?? 0}/${spec.label}`]).then(() => true, () => false)
      : false;
    return {
      manager: 'launchd',
      installed,
      running,
      serviceFilePath: spec.plistPath,
      label: spec.label,
      stdoutPath: spec.stdoutPath,
      stderrPath: spec.stderrPath,
    };
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    const installed = existsSync(spec.unitPath);
    const running = installed
      ? await runSystemctl(['--user', 'is-active', '--quiet', spec.unitName]).then(() => true, () => false)
      : false;
    return {
      manager: 'systemd-user',
      installed,
      running,
      serviceFilePath: spec.unitPath,
      label: spec.unitName,
      stdoutPath: spec.stdoutPath,
      stderrPath: spec.stderrPath,
    };
  }

  throw new Error('service_status_not_supported_on_this_platform');
}

type LaunchdSpec = {
  label: string;
  plistPath: string;
  programArgs: string[];
  workingDirectory: string;
  stdoutPath: string;
  stderrPath: string;
  environment: Record<string, string>;
};

type SystemdUserSpec = {
  unitName: string;
  unitPath: string;
  execStart: string[];
  workingDirectory: string;
  stdoutPath: string;
  stderrPath: string;
  environment: Record<string, string>;
};

function buildLaunchdSpec(context: ServiceContext): LaunchdSpec {
  const stateDir = join(homedir(), '.claude-codex-wechat');
  return {
    label: 'com.claude-codex-wechat',
    plistPath: join(homedir(), 'Library', 'LaunchAgents', 'com.claude-codex-wechat.plist'),
    programArgs: [context.nodePath ?? process.execPath, context.cliEntrypointPath, 'start'],
    workingDirectory: homedir(),
    stdoutPath: join(stateDir, 'logs', 'service.stdout.log'),
    stderrPath: join(stateDir, 'logs', 'service.stderr.log'),
    environment: buildServiceEnvironment(context),
  };
}

function buildSystemdUserSpec(context: ServiceContext): SystemdUserSpec {
  const stateDir = join(homedir(), '.claude-codex-wechat');
  return {
    unitName: 'claude-codex-wechat.service',
    unitPath: join(homedir(), '.config', 'systemd', 'user', 'claude-codex-wechat.service'),
    execStart: [context.nodePath ?? process.execPath, context.cliEntrypointPath, 'start'],
    workingDirectory: homedir(),
    stdoutPath: join(stateDir, 'logs', 'service.stdout.log'),
    stderrPath: join(stateDir, 'logs', 'service.stderr.log'),
    environment: buildServiceEnvironment(context),
  };
}

function buildServiceEnvironment(context: ServiceContext): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? homedir(),
  };
  const configPath = context.configPath ?? process.env.BRIDGE_CONFIG;
  const port = context.port ?? Number(process.env.BRIDGE_PORT ?? 8787);
  if (configPath) env.BRIDGE_CONFIG = configPath;
  if (Number.isFinite(port)) env.BRIDGE_PORT = String(port);
  for (const key of [
    'BRIDGE_WECHAT_ENABLED',
    'BRIDGE_WECHAT_BASE_URL',
    'BRIDGE_WECHAT_TOKEN',
    'BRIDGE_WECHAT_ACCOUNT_ID',
    'BRIDGE_CLAUDE_COMMAND',
    'BRIDGE_CODEX_COMMAND',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'http_proxy',
    'https_proxy',
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

function renderLaunchdPlist(spec: LaunchdSpec): string {
  const programArgs = spec.programArgs.map((arg) => `    <string>${escapeXml(arg)}</string>`).join('\n');
  const envEntries = Object.entries(spec.environment)
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${escapeXml(spec.label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    programArgs,
    '  </array>',
    '  <key>WorkingDirectory</key>',
    `  <string>${escapeXml(spec.workingDirectory)}</string>`,
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    envEntries,
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <true/>',
    '  <key>StandardOutPath</key>',
    `  <string>${escapeXml(spec.stdoutPath)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${escapeXml(spec.stderrPath)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function renderSystemdUnit(spec: SystemdUserSpec): string {
  const envEntries = Object.entries(spec.environment)
    .map(([key, value]) => `Environment=${quoteSystemdEnv(`${key}=${value}`)}`)
    .join('\n');
  return [
    '[Unit]',
    'Description=claude-codex-wechat bridge daemon',
    'After=network.target',
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${spec.workingDirectory}`,
    `ExecStart=${spec.execStart.map(quoteSystemdArg).join(' ')}`,
    envEntries,
    `StandardOutput=append:${spec.stdoutPath}`,
    `StandardError=append:${spec.stderrPath}`,
    'Restart=on-failure',
    'RestartSec=5',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function quoteSystemdArg(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function quoteSystemdEnv(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

async function runLaunchctl(args: string[]): Promise<void> {
  await execFileAsync('launchctl', args);
}

async function runSystemctl(args: string[]): Promise<void> {
  await execFileAsync('systemctl', args);
}

async function ensureFileExists(path: string, errorCode: string): Promise<void> {
  if (!existsSync(path)) throw new Error(errorCode);
  await readFile(path, 'utf8');
}

async function tailFile(path: string, lines: number): Promise<string> {
  if (!existsSync(path)) return '';
  const content = await readFile(path, 'utf8');
  return content.split(/\r?\n/).slice(-lines).join('\n').trim();
}

async function tailFiles(paths: string[]): Promise<void> {
  const readers = paths
    .filter((path) => existsSync(path))
    .map((path) => {
      const rl = createInterface({
        input: createReadStream(path, { encoding: 'utf8', start: Math.max(0, fileSizeHint(path) - 8192) }),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        process.stdout.write(`[${path}] ${line}\n`);
      });
      return rl;
    });

  if (process.platform !== 'linux' && process.platform !== 'darwin') {
    return;
  }

  const child = spawn('tail', ['-f', ...paths.filter((path) => existsSync(path))], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', (chunk) => {
    process.stdout.write(String(chunk));
  });
  await new Promise<void>((resolve, reject) => {
    child.on('exit', () => resolve());
    child.on('error', reject);
  }).finally(() => {
    for (const reader of readers) reader.close();
  });
}

function fileSizeHint(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
