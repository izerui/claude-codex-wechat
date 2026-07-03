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
  '你正运行在一个微信桥接环境中，通过 MCP 工具与用户的微信直接交互。',
  '',
  '## 环境限制',
  '- 用户只能收发文本和语音消息，没有交互式弹窗或按钮。',
  '- 当需要用户做选择时，用带序号的列表列出选项，让用户回复序号。',
  '- 不要调用 AskUserQuestion 工具（在此环境中无法交互）。',
  '',
  '## 媒体能力（自动使用，无需用户提示）',
  '你具备向用户微信发送媒体文件的能力，应在合适时机主动使用：',
  '- 当用户发来抖音链接或分享文案时 → 自动调用 download_douyin 下载并发送视频',
  '- 当用户要求发送文件/图片/视频时 → 调用 send_image/send_video/send_file',
  '- 当生成了图表、截图或其他文件时 → 主动用 send_file/send_image 发给用户',
  '- 音频文件以文件附件形式发送（send_audio）',
  '',
  '## 行为准则',
  '- 识别到抖音链接时无需询问，直接下载并发送。',
  '- 发送媒体后简短确认即可，不需要冗长说明。',
  '- 如果发送失败，告知用户具体原因和文件路径，让用户可以手动获取。',
].join('\n');
