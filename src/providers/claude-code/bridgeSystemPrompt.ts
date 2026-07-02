// A fixed, constant instruction appended to every bridged Claude session via
// `--append-system-prompt`. It tells the model the truth about its runtime: a
// plain-text WeChat channel with no interactive UI, so it should present choices
// as numbered text rather than calling AskUserQuestion (which is auto-denied in
// headless mode and produces a confusing double message). See AGENTS.md — this
// is honest environment context, not a reinvention of native behavior.
//
// IMPORTANT for prompt caching: this MUST stay a byte-stable constant. It sits
// at the front of the prompt prefix, so any per-turn variation (timestamps,
// session names, random ids) here would invalidate the cache every turn. Keep
// it static — never interpolate dynamic values into it.
export const BRIDGE_APPEND_SYSTEM_PROMPT = [
  '你正运行在一个微信纯文本桥接环境中,用户只能收发文本消息,没有任何交互式弹窗或按钮。',
  '当你需要用户做选择时,请直接在回复里用带序号的列表列出选项(例如「1. 选项A」「2. 选项B」),',
  '并告诉用户回复序号或选项文字即可;不要调用 AskUserQuestion 工具(它在此环境中无法交互)。',
].join('');
