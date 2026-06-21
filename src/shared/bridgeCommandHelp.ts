export interface BridgeCommandHelpEntry {
  command: string;
  desc: string;
}

export interface BridgeCommandHelpGroup {
  title: string;
  note?: string;
  entries: BridgeCommandHelpEntry[];
}

export const BRIDGE_COMMAND_HELP_INTRO = '直接发送文字即可与 AI 对话。';

export const BRIDGE_COMMAND_HELP_GROUPS: BridgeCommandHelpGroup[] = [
  {
    title: '会话管理',
    entries: [
      { command: '/help', desc: '显示本帮助' },
      { command: '/status', desc: '查看当前会话（provider、工作目录、状态）' },
      {
        command: '/new [claude|codex][:目录]',
        desc: '新建会话；省略 provider 用默认，可带目录，例：`/new`、`/new codex`、`/new ~/project`、`/new claude:/home/project`',
      },
      { command: '/use claude|codex', desc: '切换当前 provider' },
      { command: '/stop', desc: '停止并清除当前会话' },
      { command: '/cancel', desc: '中断当前正在生成的回复（会话保留）' },
    ],
  },
  {
    title: '历史会话',
    entries: [
      { command: '/sessions', desc: '列出最近的历史会话（按更新时间倒序）' },
      { command: '/sessions <关键词>', desc: '按标题/目录筛选' },
      { command: '/sessions mine', desc: '只看通过微信创建的会话' },
      { command: '/resume <编号>', desc: '按列表编号恢复' },
      { command: '/resume <id>', desc: '按会话 id 恢复' },
      { command: '/archive [编号]', desc: '归档会话（仅 Codex；省略则归档当前会话）' },
    ],
  },
  {
    title: '权限审批',
    note: 'AI 请求工具授权时使用，`<id>` 见请求消息',
    entries: [
      { command: '/approve <id>', desc: '批准本次请求' },
      { command: '/always <id>', desc: '本会话内永久批准该工具' },
      { command: '/deny <id>', desc: '拒绝本次请求' },
      { command: '/abort <id>', desc: '中止本次请求' },
    ],
  },
];

export function buildBridgeCommandHelpMarkdown(): string {
  const lines: string[] = ['**可用命令**', '', BRIDGE_COMMAND_HELP_INTRO];
  for (const group of BRIDGE_COMMAND_HELP_GROUPS) {
    lines.push('', `**${group.title}**${group.note ? `（${group.note}）` : ''}`);
    for (const entry of group.entries) {
      lines.push(`- \`${entry.command}\` — ${entry.desc}`);
    }
  }
  return lines.join('\n');
}
