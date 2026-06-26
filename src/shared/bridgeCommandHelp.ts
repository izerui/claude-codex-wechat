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
      { command: '/new', desc: '新建默认 provider 会话' },
      { command: '/new claude|codex', desc: '新建指定 provider 会话' },
      { command: '/new <目录>', desc: '在指定目录新建默认 provider 会话' },
      { command: '/new claude:<目录>', desc: '新建指定 provider + 指定目录会话' },
      { command: '/stop', desc: '中断当前正在生成的回复（会话保留）' },
    ],
  },
  {
    title: '历史会话',
    entries: [
      { command: '/sessions', desc: '列出最近的历史会话第 1 页（按更新时间倒序）' },
      { command: '/sessions p2', desc: '查看第 2 页；页码语法固定为 `p<number>`' },
      { command: '/sessions <关键词>', desc: '按标题/目录筛选，第 1 页' },
      { command: '/sessions <关键词> p2', desc: '查看筛选结果的第 2 页' },
      { command: '/resume <编号>', desc: '按 /sessions 列表编号恢复（也可直接用会话 id）' },
    ],
  },
];

export function buildBridgeCommandHelpMarkdown(input?: { publicUrl?: string }): string {
  const lines: string[] = ['**可用命令**', '', BRIDGE_COMMAND_HELP_INTRO];
  if (input?.publicUrl) {
    lines.push('', `**访问地址**`, '', `[${input.publicUrl}](${input.publicUrl})`);
  }
  for (const group of BRIDGE_COMMAND_HELP_GROUPS) {
    lines.push('', `**${group.title}**${group.note ? `（${group.note}）` : ''}`);
    for (const entry of group.entries) {
      lines.push(`- \`${entry.command}\` — ${entry.desc}`);
    }
  }
  return lines.join('\n');
}
