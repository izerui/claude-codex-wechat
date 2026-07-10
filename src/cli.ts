#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDaemon } from './daemon/bootstrap';
import { attachStaticFrontend } from './daemon/staticFrontend';
import { defaultConfigPath, loadBridgeConfig } from './daemon/config';
import {
  installService,
  readServiceLogs,
  readServiceStatus,
  restartService as restartManagedService,
  startService as startManagedService,
  stopService as stopManagedService,
  tailServiceLogs,
  uninstallService,
} from './daemon/service';
import { findExecutable } from './shared/platform';
import { resolveTerminalSearchPath } from './shared/loginShellEnv';
import { readClientVersion } from './shared/version';

const here = dirname(fileURLToPath(import.meta.url));
// 生产打包后 cli.js 位于 dist/server/，前端静态资源位于 dist/web/。
const webRoot = join(here, '..', 'web');

async function main(): Promise<void> {
  const command = process.argv[2];
  switch (command) {
    case undefined:
    case 'start':
      await cmdStart();
      return;
    case 'stop':
      await cmdStop();
      return;
    case 'restart':
      await cmdRestart();
      return;
    case 'status':
      await cmdStatus();
      return;
    case 'logs':
      await cmdLogs();
      return;
    case 'tail':
      await cmdTail();
      return;
    case 'doctor':
      await cmdDoctor();
      return;
    case 'uninstall':
      await cmdUninstall();
      return;
    case 'print-config':
      cmdPrintConfig();
      return;
    // 内部命令：service 文件实际拉起的前台 daemon 进程，不对外暴露。
    case '__daemon':
      await cmdDaemon();
      return;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      return;
    default:
      console.error(`未知命令: ${command}\n`);
      printUsage();
      process.exitCode = 1;
  }
}

async function cmdStart(): Promise<void> {
  if (!existsSync(webRoot)) {
    console.error(`找不到前端构建产物: ${webRoot}`);
    console.error('请重新安装完整的 npm 包。');
    process.exitCode = 1;
    return;
  }
  const context = createServiceContext();
  const status = await readServiceStatus(context).catch(() => null);
  const result = status?.installed
    ? await startManagedService(context)
    : await installService(context);
  printServiceStatus('service started', result);
}

async function cmdStop(): Promise<void> {
  const status = await stopManagedService(createServiceContext());
  printServiceStatus('service stopped', status);
}

async function cmdRestart(): Promise<void> {
  const status = await restartManagedService(createServiceContext());
  printServiceStatus('service restarted', status);
}

async function cmdStatus(): Promise<void> {
  const status = await readServiceStatus(createServiceContext());
  printServiceStatus('service status', status);
  printUpdateHint();
}

async function cmdLogs(): Promise<void> {
  console.log(await readServiceLogs(createServiceContext()));
}

async function cmdTail(): Promise<void> {
  await tailServiceLogs(createServiceContext());
}

async function cmdDaemon(): Promise<void> {
  if (!existsSync(webRoot)) {
    console.error(`找不到前端构建产物: ${webRoot}`);
    process.exitCode = 1;
    return;
  }
  await startDaemon({
    attachFrontend: attachStaticFrontend(webRoot),
    enableUpdateCheck: true,
  });
}

async function cmdDoctor(): Promise<void> {
  const configPath = process.env.BRIDGE_CONFIG ?? defaultConfigPath();
  console.log('claude-codex-wechat doctor\n');
  report('配置文件', existsSync(configPath) ? configPath : `缺失 (${configPath})，首次 start 时自动创建`);
  report('前端产物', existsSync(webRoot) ? webRoot : `缺失 (${webRoot})`);
  const searchPath = resolveTerminalSearchPath();
  const claude = await findExecutable('claude', searchPath);
  report('claude 可执行', claude ?? '未找到，需先安装并登录 Claude Code');
  const codex = await findExecutable('codex', searchPath);
  report('codex 可执行', codex ?? '未找到（仅使用 Claude 时可忽略）');
  if (existsSync(configPath)) {
    const config = loadBridgeConfig(configPath);
    const wechat = config.wechat;
    report('微信启用', wechat?.enabled ? '是' : '否');
    report('微信 token', wechat?.token ? '已配置' : '未配置');
    report('微信 accountId', wechat?.accountId ? '已配置' : '未配置');
  }
  printUpdateHint();
}

// 读 config 里 daemon 写入的更新检测结果;有新版就打印一行提示。config 无该块则不打印。
// config 若被改坏(非法 JSON)也静默跳过,保证 status/doctor 作为诊断命令始终可用。
function printUpdateHint(): void {
  const configPath = process.env.BRIDGE_CONFIG ?? defaultConfigPath();
  if (!existsSync(configPath)) return;
  let update;
  try {
    update = loadBridgeConfig(configPath).update;
  } catch {
    return;
  }
  if (!update?.updateAvailable) return;
  const current = update.currentVersion ?? readClientVersion();
  console.log(`\n发现新版 v${update.latestVersion}（当前 v${current}）。更新：`);
  console.log('  npm install -g claude-codex-wechat@latest --registry=https://registry.npmmirror.com/');
  console.log('  claude-codex-wechat restart');
}

function cmdPrintConfig(): void {
  const configPath = process.env.BRIDGE_CONFIG ?? defaultConfigPath();
  if (!existsSync(configPath)) {
    console.error(`配置不存在: ${configPath}（首次 start 后自动生成）`);
    process.exitCode = 1;
    return;
  }
  console.log(readFileSync(configPath, 'utf8'));
}

async function cmdUninstall(): Promise<void> {
  const status = await uninstallService(createServiceContext());
  printServiceStatus('service uninstalled', status);
}

function createServiceContext() {
  return {
    cliEntrypointPath: fileURLToPath(import.meta.url),
    nodePath: process.execPath,
    configPath: process.env.BRIDGE_CONFIG ?? defaultConfigPath(),
    port: Number(process.env.BRIDGE_PORT ?? 8787),
  };
}

function report(label: string, value: string): void {
  console.log(`  ${label.padEnd(14)}: ${value}`);
}

function printServiceStatus(title: string, status: Awaited<ReturnType<typeof readServiceStatus>>): void {
  console.log(`claude-codex-wechat ${title}\n`);
  report('service manager', status.manager);
  report('installed', status.installed ? 'yes' : 'no');
  report('running', status.running ? 'yes' : 'no');
  report('label', status.label);
  report('service file', status.serviceFilePath);
  report('stdout log', status.stdoutPath);
  report('stderr log', status.stderrPath);
}

function printUsage(): void {
  console.log(`claude-codex-wechat — 本地 WeChat ↔ Claude/Codex bridge daemon

用法:
  claude-codex-wechat <command>

命令:
  start          后台启动服务（未安装则自动安装，默认命令）
  stop           停止后台服务
  restart        重启后台服务
  status         查看运行状态
  logs           打印最近日志
  tail           实时跟随日志
  doctor         检查配置、前端产物与 claude/codex 可执行文件
  uninstall      卸载后台服务
  print-config   打印当前配置文件内容
  help           显示本帮助

环境变量:
  BRIDGE_PORT    监听端口（默认 8787）
  BRIDGE_CONFIG  配置文件路径（默认 ~/.claude-codex-wechat/config.json）

平台说明:
  macOS 用 launchd、Linux 用 systemd --user 托管，登录自启且崩溃自动重启。
  Windows 采用后台进程 + PID 文件托管（免管理员），不随开机自启，
  重启电脑后需重新运行 start。`);
}

// 服务托管命令（start/stop/restart 等）失败时,避免直接抛出 Node 崩溃栈吓到用户,
// 转成一行可读的错误 + 排查建议。已知的服务未安装错误给出明确指引。
main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'service_not_installed') {
    console.error('后台服务尚未安装。请先运行:\n  claude-codex-wechat start');
  } else {
    console.error(`命令执行失败: ${message}`);
    console.error('可运行 `claude-codex-wechat doctor` 检查环境,或 `claude-codex-wechat start` 重新安装服务。');
  }
  process.exitCode = 1;
});
