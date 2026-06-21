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
      { command: '/stop', desc: '中断当前正在生成的回复（会话保留）' },
    ],
  },
  {
    title: '历史会话',
    entries: [
      { command: '/sessions', desc: '列出最近的历史会话（按更新时间倒序）' },
      { command: '/sessions <关键词>', desc: '按标题/目录筛选' },
      { command: '/resume <id>', desc: '按会话 id 恢复' },
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
