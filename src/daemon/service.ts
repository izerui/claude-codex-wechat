import { existsSync, statSync, openSync, closeSync, watchFile } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createReadStream } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ServiceManager = 'launchd' | 'systemd-user' | 'process';

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
    await applyLaunchdService(spec);
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    await writeSystemdUnit(spec);
    await runSystemctl(['--user', 'daemon-reload']);
    await runSystemctl(['--user', 'enable', '--now', spec.unitName]);
    return await readServiceStatus(context);
  }

  if (process.platform === 'win32') {
    return await startService(context);
  }

  throw new Error('service_install_not_supported_on_this_platform');
}

export async function startService(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    // 重写 plist 再重载,而不是复用磁盘上可能已过时的旧 plist(如换了 Node 环境、包重装到别的
    // prefix,旧 plist 会把服务锁死在失效路径)。applyLaunchdService 让 start 始终指向当前这份 node+cli.js。
    await applyLaunchdService(spec);
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    // 同 macOS:重写 unit 再启动,保证 ExecStart 指向当前实际调用的 node+cli.js,不被旧 unit 锁死。
    await writeSystemdUnit(spec);
    await runSystemctl(['--user', 'daemon-reload']);
    await runSystemctl(['--user', 'start', spec.unitName]);
    return await readServiceStatus(context);
  }

  if (process.platform === 'win32') {
    const spec = buildProcessSpec(context);
    const existingPid = await readPidFile(spec.pidPath);
    if (existingPid !== null && isProcessAlive(existingPid)) {
      return await readServiceStatus(context);
    }
    await spawnDetachedDaemon(spec);
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

  if (process.platform === 'win32') {
    const spec = buildProcessSpec(context);
    const pid = await readPidFile(spec.pidPath);
    if (pid !== null && isProcessAlive(pid)) {
      await killPid(pid).catch(() => undefined);
    }
    await removePidFile(spec.pidPath);
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

  if (process.platform === 'win32') {
    return await stopService(context);
  }

  throw new Error('service_uninstall_not_supported_on_this_platform');
}

export async function restartService(context: ServiceContext): Promise<ServiceStatus> {
  if (process.platform === 'darwin') {
    const spec = buildLaunchdSpec(context);
    // 关键:restart 必须重写 plist,而不是复用磁盘上的旧 plist 直接 kickstart。否则一旦历史 plist
    // 指向已失效的路径(换了 Node 环境、包重装到别的 prefix),无论 restart 多少次都拉起旧的那份。
    // applyLaunchdService 先写最新 plist(指向当前实际调用的 node+cli.js),再 bootout→bootstrap→
    // kickstart 强制重载,使 restart 具备把服务重新对齐到当前安装的自愈能力。
    await applyLaunchdService(spec);
    return await readServiceStatus(context);
  }

  if (process.platform === 'linux') {
    const spec = buildSystemdUserSpec(context);
    // 同 macOS:重写 unit 再重启,保证 ExecStart 对齐当前安装,而不是被旧 unit 锁死。
    await writeSystemdUnit(spec);
    await runSystemctl(['--user', 'daemon-reload']);
    await runSystemctl(['--user', 'restart', spec.unitName]);
    return await readServiceStatus(context);
  }

  if (process.platform === 'win32') {
    await stopService(context);
    return await startService(context);
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

  if (process.platform === 'win32') {
    const spec = buildProcessSpec(context);
    const pid = await readPidFile(spec.pidPath);
    const installed = pid !== null;
    const running = pid !== null && isProcessAlive(pid);
    return {
      manager: 'process',
      installed,
      running,
      serviceFilePath: spec.pidPath,
      label: 'claude-codex-wechat',
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

type ProcessServiceSpec = {
  pidPath: string;
  command: string[];
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
    programArgs: [context.nodePath ?? process.execPath, context.cliEntrypointPath, '__daemon'],
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
    execStart: [context.nodePath ?? process.execPath, context.cliEntrypointPath, '__daemon'],
    workingDirectory: homedir(),
    stdoutPath: join(stateDir, 'logs', 'service.stdout.log'),
    stderrPath: join(stateDir, 'logs', 'service.stderr.log'),
    environment: buildServiceEnvironment(context),
  };
}

export function buildProcessSpec(context: ServiceContext): ProcessServiceSpec {
  const stateDir = join(homedir(), '.claude-codex-wechat');
  return {
    pidPath: join(stateDir, 'service.pid'),
    command: [context.nodePath ?? process.execPath, context.cliEntrypointPath, '__daemon'],
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

// 写入 plist 后强制重载:bootout 清除旧注册(可能残留、且可能指向已失效的 node/入口路径),
// bootstrap 用刚写的最新 plist 重新注册,kickstart -k 杀掉旧进程并按新定义拉起。
// install/start/restart 共用,保证服务定义始终对齐当前实际调用的这份 node + cli.js。
async function applyLaunchdService(spec: LaunchdSpec): Promise<void> {
  await mkdir(dirname(spec.plistPath), { recursive: true });
  await mkdir(dirname(spec.stdoutPath), { recursive: true });
  await writeFile(spec.plistPath, renderLaunchdPlist(spec), 'utf8');
  const guiDomain = `gui/${process.getuid?.() ?? 0}`;
  await runLaunchctl(['bootout', guiDomain, spec.plistPath]).catch(() => undefined);
  await runLaunchctl(['bootstrap', guiDomain, spec.plistPath]);
  await runLaunchctl(['kickstart', '-k', `${guiDomain}/${spec.label}`]);
}

// 写入 systemd user unit(不含 daemon-reload/启动动作),供 install/start/restart 各自按语义
// 追加 enable/start/restart 动词。始终重写,保证 ExecStart 对齐当前实际调用的 node + cli.js。
async function writeSystemdUnit(spec: SystemdUserSpec): Promise<void> {
  await mkdir(dirname(spec.unitPath), { recursive: true });
  await mkdir(dirname(spec.stdoutPath), { recursive: true });
  await writeFile(spec.unitPath, renderSystemdUnit(spec), 'utf8');
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

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH: 进程不存在；EPERM: 进程存在但无权限发信号（视为存活）。
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export async function readPidFile(pidPath: string): Promise<number | null> {
  if (!existsSync(pidPath)) return null;
  try {
    const raw = (await readFile(pidPath, 'utf8')).trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

export async function writePidFile(pidPath: string, pid: number): Promise<void> {
  await mkdir(dirname(pidPath), { recursive: true });
  await writeFile(pidPath, `${pid}\n`, 'utf8');
}

export async function removePidFile(pidPath: string): Promise<void> {
  await rm(pidPath, { force: true });
}

async function killPid(pid: number): Promise<void> {
  if (process.platform === 'win32') {
    // taskkill /T 级联终止整棵进程树；Node 的 process.kill 不会终止子进程树。
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }
  process.kill(pid, 'SIGTERM');
}

async function spawnDetachedDaemon(spec: ProcessServiceSpec): Promise<number> {
  await mkdir(dirname(spec.stdoutPath), { recursive: true });
  const outFd = openSync(spec.stdoutPath, 'a');
  const errFd = openSync(spec.stderrPath, 'a');
  try {
    const [command, ...args] = spec.command;
    const child = spawn(command, args, {
      cwd: spec.workingDirectory,
      // Windows 分离进程需继承完整 process.env（SystemRoot/APPDATA/PATHEXT 等），
      // 否则子进程及其拉起的 claude/codex 会异常；spec.environment 仅作 BRIDGE_* 等覆盖层。
      env: { ...process.env, ...spec.environment },
      detached: true,
      windowsHide: true,
      stdio: ['ignore', outFd, errFd],
    });
    if (typeof child.pid !== 'number') {
      throw new Error('service_spawn_failed');
    }
    await writePidFile(spec.pidPath, child.pid);
    child.unref();
    return child.pid;
  } finally {
    // 子进程已继承 fd，父进程侧可关闭。
    closeSync(outFd);
    closeSync(errFd);
  }
}

async function tailFile(path: string, lines: number): Promise<string> {
  if (!existsSync(path)) return '';
  const content = await readFile(path, 'utf8');
  return content.split(/\r?\n/).slice(-lines).join('\n').trim();
}

async function tailFiles(paths: string[]): Promise<void> {
  const existing = paths.filter((path) => existsSync(path));

  // 先打印各文件当前尾部。
  for (const path of existing) {
    const tail = await tailFile(path, 200);
    if (tail) process.stdout.write(`[${path}]\n${tail}\n`);
  }

  if (process.platform === 'linux' || process.platform === 'darwin') {
    const child = spawn('tail', ['-f', ...existing], { stdio: ['ignore', 'pipe', 'inherit'] });
    child.stdout.on('data', (chunk) => {
      process.stdout.write(String(chunk));
    });
    await new Promise<void>((resolve, reject) => {
      child.on('exit', () => resolve());
      child.on('error', reject);
    });
    return;
  }

  // win32（及其它平台）：用 watchFile 轮询，读取追加内容实现 tail -f。
  const offsets = new Map<string, number>(existing.map((path) => [path, fileSizeHint(path)]));
  for (const path of existing) {
    watchFile(path, { interval: 1000 }, (curr) => {
      const prevSize = offsets.get(path) ?? 0;
      if (curr.size < prevSize) {
        // 文件被截断/轮转，重置偏移从头读。
        offsets.set(path, 0);
        return;
      }
      if (curr.size === prevSize) return;
      const start = prevSize;
      offsets.set(path, curr.size);
      const rl = createInterface({
        input: createReadStream(path, { encoding: 'utf8', start, end: curr.size - 1 }),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        process.stdout.write(`[${path}] ${line}\n`);
      });
    });
  }
  // 阻塞直到进程被中断（与 tail -f 行为一致）；watchFile 维持事件循环存活。
  await new Promise<void>(() => {});
}

function fileSizeHint(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}
