#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDaemon } from './daemon/bootstrap';
import { findListeningProcess } from './daemon/portGuard';
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
    case 'init':
      cmdInit();
      return;
    case 'doctor':
      await cmdDoctor();
      return;
    case 'service':
      await cmdService(process.argv.slice(3));
      return;
    case 'print-config':
      cmdPrintConfig();
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
    console.error('请先运行构建 (pnpm build) 后再启动，或重新安装完整的 npm 包。');
    process.exitCode = 1;
    return;
  }
  const context = createServiceContext();
  const port = context.port ?? 8787;
  const occupiedBy = await findListeningProcess(port);
  if (occupiedBy) {
    const serviceStatus = await readServiceStatus(context).catch(() => null);
    if (serviceStatus?.installed && serviceStatus.running) {
      console.log(`端口 ${port} 已被后台服务占用，先停止服务再以前台模式启动。`);
      await stopManagedService(context);
    } else {
      console.error(`端口 ${port} 已被占用: PID=${occupiedBy.pid} COMMAND=${occupiedBy.command}`);
      console.error('请先停止占用进程，或改用 `claude-codex-wechat service stop` 停掉后台服务。');
      process.exitCode = 1;
      return;
    }
  }
  await startDaemon({
    attachFrontend: attachStaticFrontend(webRoot),
  });
}

function cmdInit(): void {
  const configPath = process.env.BRIDGE_CONFIG ?? defaultConfigPath();
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });
  if (existsSync(configPath)) {
    console.log(`配置已存在，未覆盖: ${configPath}`);
    return;
  }
  const template = {
    wechat: {
      enabled: true,
      baseUrl: 'https://ilinkai.weixin.qq.com',
      token: 'replace-with-weixin-bot-token',
      accountId: 'replace-with-weixin-account-id',
    },
    providers: {},
    bridge: {
      defaultProvider: 'claude-code',
      defaultWorkspace: process.cwd(),
    },
  };
  writeFileSync(configPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
  console.log(`已创建配置: ${configPath}`);
  console.log('请填入微信 token / accountId 后运行: claude-codex-wechat start');
}

async function cmdDoctor(): Promise<void> {
  const configPath = process.env.BRIDGE_CONFIG ?? defaultConfigPath();
  console.log('claude-codex-wechat doctor\n');
  report('配置文件', existsSync(configPath) ? configPath : `缺失 (${configPath})，运行 init 创建`);
  report('前端产物', existsSync(webRoot) ? webRoot : `缺失 (${webRoot})`);
  const claude = await findExecutable('claude');
  report('claude 可执行', claude ?? '未找到，需先安装并登录 Claude Code');
  const codex = await findExecutable('codex');
  report('codex 可执行', codex ?? '未找到（仅使用 Claude 时可忽略）');
  if (existsSync(configPath)) {
    const config = loadBridgeConfig(configPath);
    const wechat = config.wechat;
    report('微信启用', wechat?.enabled ? '是' : '否');
    report('微信 token', wechat?.token ? '已配置' : '未配置');
    report('微信 accountId', wechat?.accountId ? '已配置' : '未配置');
  }
}

function cmdPrintConfig(): void {
  const configPath = process.env.BRIDGE_CONFIG ?? defaultConfigPath();
  if (!existsSync(configPath)) {
    console.error(`配置不存在: ${configPath}（运行 init 创建）`);
    process.exitCode = 1;
    return;
  }
  console.log(readFileSync(configPath, 'utf8'));
}

async function cmdService(args: string[]): Promise<void> {
  const action = args[0] ?? 'status';
  const context = createServiceContext();

  switch (action) {
    case 'install': {
      const status = await installService(context);
      printServiceStatus('service installed', status);
      return;
    }
    case 'start': {
      const status = await startManagedService(context);
      printServiceStatus('service started', status);
      return;
    }
    case 'stop': {
      const status = await stopManagedService(context);
      printServiceStatus('service stopped', status);
      return;
    }
    case 'restart': {
      const status = await restartManagedService(context);
      printServiceStatus('service restarted', status);
      return;
    }
    case 'logs': {
      console.log(await readServiceLogs(context));
      return;
    }
    case 'tail': {
      await tailServiceLogs(context);
      return;
    }
    case 'uninstall': {
      const status = await uninstallService(context);
      printServiceStatus('service uninstalled', status);
      return;
    }
    case 'status': {
      const status = await readServiceStatus(context);
      printServiceStatus('service status', status);
      return;
    }
    default:
      console.error(`未知 service 子命令: ${action}\n`);
      printUsage();
      process.exitCode = 1;
  }
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
  start          启动 daemon（默认命令，前台运行）
  init           在 ~/.claude-codex-wechat/ 创建默认配置
  doctor         检查配置、前端产物与 claude/codex 可执行文件
  service        管理后台服务（install/start/stop/restart/status/logs/tail/uninstall）
  print-config   打印当前配置文件内容
  help           显示本帮助

环境变量:
  BRIDGE_PORT    监听端口（默认 8787）
  BRIDGE_CONFIG  配置文件路径（默认 ~/.claude-codex-wechat/config.json）

常驻运行请用进程管理器托管，例如:
  pm2 start claude-codex-wechat -- start`);
}

await main();
