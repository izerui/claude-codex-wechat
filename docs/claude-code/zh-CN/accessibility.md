> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 使用 Claude Code 与屏幕阅读器

> 为 VoiceOver 和 NVDA 等屏幕阅读器设置 Claude Code，以及屏幕放大镜、减少动画和色盲友好主题的设置。

Claude Code 具有屏幕阅读器模式，可将其视觉终端界面替换为纯文本、线性文本。该模式不使用框、进度动画和原地重绘，而是打印带标签的行，屏幕阅读器（如 VoiceOver 或 NVDA）按顺序读取这些行，因此您可以进行完整对话、批准工具权限并从头到尾查看输出。

屏幕阅读器模式是可选的。如果您使用屏幕放大镜、减少动画或色盲友好主题而不是屏幕阅读器，请参阅[屏幕阅读器模式之外的辅助功能设置](#accessibility-settings-beyond-screen-reader-mode)。

<Note>
  屏幕阅读器模式需要 Claude Code v2.1.181 或更高版本。早期版本会拒绝 `--ax-screen-reader` 标志，并显示 `error: unknown option '--ax-screen-reader'`。
</Note>

<h2 id="turn-on-screen-reader-mode">
  打开屏幕阅读器模式
</h2>

选择与您使用屏幕阅读器频率相匹配的方法：

* 对于一个会话：运行 `claude --ax-screen-reader`。
* 对于从一个 shell 启动的会话：将 `CLAUDE_AX_SCREEN_READER` 环境变量设置为 `1`。在 Bash 或 Zsh 中，运行 `export CLAUDE_AX_SCREEN_READER=1`；在 PowerShell 中，运行 `$env:CLAUDE_AX_SCREEN_READER = "1"`。将该行添加到您的 shell 配置文件以覆盖每个 shell。
* 对于机器上的每个会话：将 `"axScreenReader": true` 添加到您的用户[设置文件](/docs/zh-CN/settings)。这涵盖任何终端，包括 VS Code 集成终端。

<Note>
  这些方法按优先级顺序列出：[`--ax-screen-reader`](/docs/zh-CN/cli-reference#cli-flags) 标志覆盖 [`CLAUDE_AX_SCREEN_READER`](/docs/zh-CN/env-vars) 环境变量，后者覆盖 [`axScreenReader`](/docs/zh-CN/settings#available-settings) 设置。
</Note>

如果您通过 SSH 使用 Claude Code，请在运行 Claude Code 的远程机器上设置环境变量或设置。

当模式打开时，Claude Code 打印的第一件事是一条确认行，命名打开它的方法：`[Screen Reader Mode: on via flag]`、`[Screen Reader Mode: on via env]` 或 `[Screen Reader Mode: on via settings]`。此方法命名格式需要 Claude Code v2.1.206 或更高版本。当 Claude Code 重新启动自身时（例如完成安装更新），新进程通过 `CLAUDE_AX_SCREEN_READER` 环境变量继承该模式，因此其确认行读取 `[Screen Reader Mode: on via env]`，无论您使用了哪种方法。
早期版本打印 `[Accessible screen reader mode: on]`。

<h2 id="turn-off-screen-reader-mode">
  关闭屏幕阅读器模式
</h2>

反转打开模式的任何方法：启动时不使用标志、取消设置环境变量或将 `axScreenReader` 设置为 `false`。设置 `CLAUDE_AX_SCREEN_READER=0` 即使设置为 `true` 也会保持模式关闭。

<h2 id="what-your-screen-reader-hears">
  您的屏幕阅读器听到的内容
</h2>

在屏幕阅读器模式中，Claude Code 写入平面文本：

* 界面装饰没有制表符绘制字符
* 没有仅限颜色的提示
* 没有未更改内容的重绘；进度旋转器呈现为静态文本
* Claude 回复中的表格读作 `Header: value` 句子而不是制表符字符网格。需要 Claude Code v2.1.198 或更高版本；早期版本即使在屏幕阅读器模式下也将表格绘制为网格。

输出在您的终端滚动缓冲区中累积，因此您可以使用屏幕阅读器的查看命令或终端的搜索功能重新阅读早期的轮次。

屏幕阅读器模式呈现为纯滚动文本，即使您已使用 [`tui` 设置](/docs/zh-CN/settings#available-settings)打开[全屏渲染](/docs/zh-CN/fullscreen)；当模式处于活动状态时，该设置无效。附加的后台会话仍呈现全屏；请参阅[已知限制](#known-limitations)。

成绩单中的每条消息都以您的屏幕阅读器宣布的标签开头，命名它是什么：您的消息、Claude 的回复、工具活动、错误和提示。这些标签也是可搜索的，因此您可以通过搜索终端的滚动缓冲区在成绩单的各个部分之间跳转：

| 标签                     | 含义                                                |
| :--------------------- | :------------------------------------------------ |
| `you:`                 | 您的消息                                              |
| `claude:`              | Claude 的回复                                        |
| `tool:`                | 工具活动，例如文件编辑或命令运行                                  |
| `tool error:`          | 失败的工具                                             |
| `error:`               | 对话中的错误，例如失败的 API 请求                               |
| `Permission Required:` | 等待您回答的权限提示                                        |
| `Cost:`                | Claude Code 退出时的会话成本摘要，如果您的帐户[显示成本](/docs/zh-CN/costs) |

终端光标跟随输入插入符号，因此屏幕阅读器的读取当前行命令用您正在编辑的提示回答"我在哪里"。

<h3 id="jump-between-turns">
  在轮次之间跳转
</h3>

Claude Code 在轮次边界处发出 OSC 133 shell 集成标记，因此您的终端的跳转到上一个提示键可在轮次之间移动，而无需读取整个成绩单：

* iTerm2：Cmd+Shift+Up
* VS Code 终端：Windows 上的 Ctrl+Up，macOS 上的 Cmd+Up
* Windows Terminal：默认没有键；在其设置中绑定 `scrollToMark` 操作
* Kitty 和 Ghostty：检查终端的文档以了解其跳转到提示键

macOS Terminal 不对标记进行操作，Claude Code 在 WezTerm 中不发出标记。在这些终端中，搜索滚动缓冲区中的 `you:` 标签。

<h2 id="answer-menus-and-prompts">
  回答菜单和提示
</h2>

在屏幕阅读器模式中，您通常使用箭头键导航的菜单（包括权限提示）变成编号列表。每个选项都宣布为编号行，后跟一个 `Enter selection` 提示，该提示命名有效范围。键入您想要的选项的编号，然后按 Enter。

* 要取消可关闭的菜单：按 Escape。其提示以 `or Escape to cancel` 结尾。
* 如果您键入列表中不存在的编号：Claude Code 宣布有效范围并让您重试。

是或否提示要求输入类型答案而不是两选项菜单。回答 `y` 或 `n` 并按 Enter。`yes` 和 `no` 也可以。

<h2 id="hear-when-claude-code-needs-you">
  听到 Claude Code 何时需要您
</h2>

在屏幕阅读器模式中，Claude Code 在需要您注意时会响起终端铃声，因此您不必一直检查成绩单。铃声在以下情况下响起：

* Claude 完成回复
* 出现权限提示
* 运行时间超过 5 秒的工具完成

铃声是您的终端的标准警报。要使其静音，请更改您的终端应用程序中的铃声设置。铃声不需要屏幕阅读器模式：在模式外，将 [`preferredNotifChannel`](/docs/zh-CN/settings#available-settings) 设置为 `"terminal_bell"` 以在 Claude 等待您时获得类似的警报。请参阅[获取终端铃声或通知](/docs/zh-CN/terminal-config#get-a-terminal-bell-or-notification)。

<h2 id="accessibility-settings-beyond-screen-reader-mode">
  屏幕阅读器模式之外的辅助功能设置
</h2>

这些选项解决屏幕阅读器模式之外的辅助功能需求。所有这些都与它一起工作。

* `CLAUDE_CODE_ACCESSIBILITY` [环境变量](/docs/zh-CN/env-vars)用于屏幕放大镜。设置 `CLAUDE_CODE_ACCESSIBILITY=1` 以保持本机终端光标可见，以便放大镜（如 macOS Zoom）可以跟踪光标位置。
* `prefersReducedMotion` [设置](/docs/zh-CN/settings#available-settings)减少或禁用旋转器、闪烁和其他动画，而不改变界面的其余部分。
* `theme` [设置](/docs/zh-CN/settings#available-settings)选择界面颜色，包括色盲友好的 `dark-daltonized` 和 `light-daltonized` 主题。

<h2 id="known-limitations">
  已知限制
</h2>

某些行为不适应屏幕阅读器模式：

* 屏幕阅读器模式在屏幕阅读器运行时不会自动打开。
* 模式更改（例如进入[计划模式](/docs/zh-CN/permission-modes#analyze-before-you-edit-with-plan-mode)）尚未宣布。
* 使用 `claude attach` 或从代理视图附加到[后台会话](/docs/zh-CN/agent-view)会进入终端的备用屏幕，该屏幕没有本机滚动缓冲区。这与[其他附加会话的行为相同](/docs/zh-CN/fullscreen)。要退出，请在空提示上按左箭头，或如果对话框有焦点，请按 Ctrl+Z。
* Claude Code 在退出时打印的摘要中宣布成本，而不是每轮。
* 屏幕阅读器模式不改变带有 `-p` 标志的[非交互模式](/docs/zh-CN/headless)。非交互模式已经写入纯文本，并且仍然是脚本编写的替代方案。

<h2 id="report-an-issue">
  报告问题
</h2>

如果屏幕阅读器、放大镜或终端出现问题，请在 [Claude Code 问题跟踪器](https://github.com/anthropics/claude-code/issues)上打开问题，并在标题中提及您的辅助技术。在报告中包括您的操作系统、终端应用程序以及辅助技术名称和版本。

<h2 id="related-resources">
  相关资源
</h2>

这些页面包含此页面涵盖内容的完整参考条目和相关设置：

* [Settings](/docs/zh-CN/settings#available-settings)：`axScreenReader`、`prefersReducedMotion`、`theme` 和 `preferredNotifChannel` 条目
* [Environment variables](/docs/zh-CN/env-vars)：`CLAUDE_AX_SCREEN_READER` 和 `CLAUDE_CODE_ACCESSIBILITY` 条目
* [CLI reference](/docs/zh-CN/cli-reference#cli-flags)：`--ax-screen-reader` 标志
* [Terminal configuration](/docs/zh-CN/terminal-config)：屏幕阅读器模式外的铃声、通知和主题
* [Non-interactive mode](/docs/zh-CN/headless)：脚本化 `claude -p` 运行，写入纯文本而不使用屏幕阅读器模式
