> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 全屏渲染

> 启用更流畅、无闪烁的渲染模式，支持鼠标操作，在长对话中保持稳定的内存使用。

<Note>
  全屏渲染是一个可选的[研究预览](#research-preview)功能。在当前对话中运行 `/tui fullscreen` 来切换。行为可能会根据反馈而改变。
</Note>

全屏渲染是 Claude Code CLI 的一种替代渲染路径，它消除了闪烁，在长对话中保持内存使用量平稳，并添加了鼠标支持。它在终端的备用屏幕缓冲区上绘制界面，就像 `vim` 或 `htop` 一样，并且只渲染当前可见的消息。这减少了每次更新时发送到终端的数据量。

在渲染吞吐量是瓶颈的终端模拟器中，如 VS Code 集成终端、tmux 和 iTerm2，差异最为明显。如果您的终端滚动位置在 Claude 工作时跳到顶部，或者工具输出流入时屏幕闪烁，此模式可以解决这些问题。

<Note>
  术语"全屏"描述的是 Claude Code 如何接管终端的绘制表面，就像 `vim` 一样。它与最大化终端窗口无关，在任何窗口大小下都能工作。
</Note>

<h2 id="enable-fullscreen-rendering">
  启用全屏渲染
</h2>

在任何 Claude Code 对话中运行 `/tui fullscreen`。CLI 会保存 [`tui` 设置](/docs/zh-CN/settings#available-settings)并以您的对话完整地重新启动到全屏模式，因此您可以在会话中途切换而不会丢失上下文。运行 `/tui default` 来切换回经典渲染器，或运行不带参数的 `/tui` 来打印当前活动的渲染器。

重新启动的会话会保持对话在屏幕上显示的样子。如果您在会话早期运行过 [`/rewind`](/docs/zh-CN/checkpointing#rewind-and-summarize)，重新启动会从倒带点而不是保存在磁盘上的较长记录中恢复。在 v2.1.207 之前，在倒带后切换渲染器会恢复倒带已删除的对话。

您也可以在启动 Claude Code 之前设置 `CLAUDE_CODE_NO_FLICKER` 环境变量：

```bash theme={null}
CLAUDE_CODE_NO_FLICKER=1 claude
```

`tui` 设置和环境变量是等效的。`/tui` 命令会从重新启动的进程中清除 `CLAUDE_CODE_NO_FLICKER`，以便它写入的设置生效。

<h2 id="what-changes">
  变化内容
</h2>

全屏渲染改变了 CLI 绘制到终端的方式。输入框保持固定在屏幕底部，而不是在输出流入时移动。如果输入框在 Claude 工作时保持不动，则全屏渲染处于活动状态。只有可见的消息保留在渲染树中，因此无论对话长度如何，内存都保持恒定。

由于对话存在于备用屏幕缓冲区而不是终端的滚动历史中，一些事情的工作方式不同：

| 之前                     | 现在                                      | 详情                                             |
| :--------------------- | :-------------------------------------- | :--------------------------------------------- |
| `Cmd+f` 或 tmux 搜索来查找文本 | `Ctrl+o` 进入记录模式，然后 `/` 来搜索或 `[` 来写入滚动历史 | [搜索和查看对话](#search-and-review-the-conversation) |
| 终端的原生点击拖动来选择和复制        | 应用内选择，鼠标释放时自动复制                         | [使用鼠标](#use-the-mouse)                         |
| `Cmd` 点击来打开 URL        | macOS 上的 `Cmd` 点击，其他地方的 `Ctrl` 点击       | [使用鼠标](#use-the-mouse)                         |

如果鼠标捕获干扰您的工作流程，您可以[关闭它](#keep-native-text-selection)，同时保持无闪烁渲染。

<h2 id="use-the-mouse">
  使用鼠标
</h2>

全屏渲染捕获鼠标事件并在 Claude Code 内处理它们：

* **在提示输入框中点击**以在您正在输入的文本中的任何位置放置光标。
* **点击 `/` 命令或 `@` 文件列表中的建议**以接受它。悬停会突出显示光标下的行。
* **点击选择菜单中的选项**以选择它。这涵盖权限提示、`/model`、`/config` 和其他显示选项列表的对话框。悬停会在光标下的行上显示指针。需要 Claude Code v2.1.187 或更高版本。
* **点击多选菜单中的选项**以切换它，然后点击提交按钮以确认您的选择。点击自由文本行（例如多选题中的 `Other` 行）会聚焦其输入字段，以便您可以输入答案。需要 Claude Code v2.1.208 或更高版本。
* **点击折叠的工具结果**以展开它并查看完整输出。再次点击以折叠。工具调用及其结果一起展开。只有有更多内容要显示的消息才可点击。
* **在 macOS 上按住 `Cmd`，或在 Linux 和 Windows 上按住 `Ctrl`，然后点击 URL 或文件路径**以打开它。工具输出中的文件路径，如 Edit 或 Write 后打印的路径，在您的默认应用程序中打开。纯 `http://` 和 `https://` URL 在您的浏览器中打开。从 v2.1.181 开始，不按住 `Cmd` 或 `Ctrl` 的纯点击不再打开链接，与原生终端行为相匹配。某些 macOS 终端将 `Cmd`+点击转发给正在运行的应用程序，而不是由终端本身打开链接，终端鼠标协议无法编码 `Cmd` 键，因此 Claude Code 将其接收为纯点击。在 Ghostty 中，以及从 v2.1.198 开始在 macOS 上的 Warp 中，Claude Code 检测到这一点并让纯点击打开链接，按住 `Cmd` 仍然有效。在 VS Code 集成终端和类似的基于 xterm.js 的终端中，Claude Code 遵从终端自己的链接处理程序，该处理程序使用相同的手势。
* **点击并拖动**以在对话中的任何位置选择文本。双击选择一个单词，匹配 iTerm2 的单词边界，以便文件路径作为一个单位选择。从 v2.1.198 开始，双击 URL 会选择整个 URL，包括方案。三击选择该行。
* **用鼠标滚轮滚动**以在对话中移动。

选定的文本在鼠标释放时自动复制到您的剪贴板。要关闭此功能，请在 `/config` 中切换"选择时复制"。

关闭"选择时复制"后，按 `Ctrl+Shift+c` 手动复制。在支持 kitty 键盘协议的终端上，如 kitty、WezTerm、Ghostty 和 iTerm2，`Cmd+c` 也可以工作。如果您有活动的选择，`Ctrl+c` 会复制而不是取消。

使用活动的选择时，按住 `Shift` 并按箭头键从键盘扩展它。`Shift+↑` 和 `Shift+↓` 在选择到达顶部或底部边缘时滚动视口。`Shift+Home` 和 `Shift+End` 扩展到当前行的开始或结束。

<h2 id="scroll-the-conversation">
  滚动对话
</h2>

全屏渲染在应用内处理滚动。使用这些快捷键来导航：

| 快捷键             | 操作              |
| :-------------- | :-------------- |
| `PgUp` / `PgDn` | 向上或向下滚动半屏       |
| `Ctrl+Home`     | 跳到对话的开始         |
| `Ctrl+End`      | 跳到最新消息并重新启用自动跟随 |
| 鼠标滚轮            | 一次滚动几行          |

在没有专用 `PgUp`、`PgDn`、`Home` 或 `End` 键的键盘上，如 MacBook 键盘，按住 `Fn` 并使用箭头键：`Fn+↑` 发送 `PgUp`，`Fn+↓` 发送 `PgDn`，`Fn+←` 发送 `Home`，`Fn+→` 发送 `End`。`Ctrl+Fn+→` 在 macOS 上无法到达 Claude Code，因此 MacBook 键盘默认没有可用的跳到底部快捷键。相反，使用以下选项之一：

* 点击[跳到底部按钮](#auto-follow)。
* 用鼠标滚轮滚动到底部以恢复跟随。
* 将 `scroll:bottom` 重新绑定到您的键盘可以发送的快捷键。

这些操作是可重新绑定的。请参阅[滚动操作](/docs/zh-CN/keybindings#scroll-actions)以获取完整的操作名称列表，包括没有默认绑定的半页和全页变体。

<h3 id="auto-follow">
  自动跟随
</h3>

向上滚动会暂停自动跟随，以便新输出不会将您拉回底部。当您向上滚动时，一个`跳到底部`按钮会浮动在记录的底部边缘，当新输出到达时显示计数，如`3 条新消息`。点击它、按 `Ctrl+End` 或滚动到底部以恢复跟随。

自动跟随暂停时，当响应完成流式传输时，视图也会保持在您滚动到的位置。在 v2.1.207 之前，当长响应完成流式传输时，视图可能会跳到答案开始之上。

按钮的键盘提示反映您的键盘可以发送的内容。在 macOS 上，它建议点击或 `Fn+↓` 来滚动，因为 `Ctrl+End` 无法从 Mac 键盘到达 Claude Code。重新绑定 [`scroll:bottom`](/docs/zh-CN/keybindings#scroll-actions)，按钮会在每个平台上显示您的快捷键。在 v2.1.206 之前，按钮在 macOS 上建议 `Ctrl+End`。

在太窄而无法容纳完整标签的终端上，按钮会缩短提示而不是换行到记录行下方。在 v2.1.206 之前，长标签可能会换行覆盖记录。

要完全关闭自动跟随，以便视图保持在您离开的位置，请打开 `/config` 并将自动滚动设置为关闭。禁用自动滚动后，视图永远不会自动跳到底部。权限提示和其他需要响应的对话框仍然会滚动到视图中，无论此设置如何。

<h3 id="mouse-wheel-scrolling">
  鼠标滚轮滚动
</h3>

鼠标滚轮滚动需要您的终端将鼠标事件转发到 Claude Code。大多数终端在应用程序请求时都会这样做。iTerm2 将其作为每个配置文件的设置：如果滚轮不起作用但 `PgUp` 和 `PgDn` 有效，请打开"设置"→"配置文件"→"终端"并打开"启用鼠标报告"。点击展开和文本选择也需要相同的设置。

如果鼠标滚轮滚动感觉很慢，您的终端可能每个物理凹口发送一个滚动事件，没有乘数。一些终端，如 Ghostty 和启用了更快滚动的 iTerm2，已经放大了滚轮事件。其他的，包括 VS Code 集成终端，每个凹口发送恰好一个事件。Claude Code 无法检测哪个。

设置 `CLAUDE_CODE_SCROLL_SPEED` 来乘以基础滚动距离：

```bash theme={null}
export CLAUDE_CODE_SCROLL_SPEED=3
```

值 `3` 与 `vim` 和类似应用程序中的默认值匹配。该设置接受 1 到 20 的值，以及 1 以下的分数值，如 `0.5`，以减缓已经放大滚轮事件的终端中加速的触控板和滚轮滚动。

要交互式地调整滚动速度，请运行 `/scroll-speed`。该对话框显示一个标尺，您可以在其打开时滚动，以便您可以立即感受到变化。按 `←` 和 `→` 来调整，按 `r` 重置为自动检测的默认值，按 `Enter` 保存。

该命令写入与 `CLAUDE_CODE_SCROLL_SPEED` 环境变量设置相同的值，持久化到 `~/.claude/settings.json`。该命令在 JetBrains IDE 终端中不可用。

除了基础速度外，Claude Code 还会在您快速旋转滚轮时加速滚动速率，因此快速旋转覆盖的距离比相同数量的慢凹口更远。要关闭加速并保持每个凹口的恒定速率，请在 [`settings.json`](/docs/zh-CN/settings#available-settings) 中将 `wheelScrollAccelerationEnabled` 设置为 `false`。此设置需要 Claude Code v2.1.174 或更高版本。

<h3 id="scroll-in-the-jetbrains-ide-terminal">
  JetBrains IDE 终端中的滚动
</h3>

在 JetBrains IDE 终端中，Claude Code 应用其自己的滚动处理并忽略 `CLAUDE_CODE_SCROLL_SPEED`。终端以比其他模拟器高得多的速率发送滚动事件，因此在其他地方调整的乘数会在这里超出。

在 2025.2 中，终端还存在滚动滚轮错误，会产生虚假的箭头键和错误方向的事件。Claude Code 在运行时检测这些错误并自动缓解它们，因此触控板和鼠标滚轮滚动无需配置即可工作。为了获得最佳滚动体验，请升级到 2025.3 或更高版本。如果 Claude Code 检测到该错误，它会在您第一次滚动时显示提示。

<h2 id="search-and-review-the-conversation">
  搜索和查看对话
</h2>

`Ctrl+o` 在正常提示和记录模式之间切换。

对于一个更安静的视图，只显示您的最后一个提示、工具调用的单行摘要和编辑 diffstats，以及最终响应，请运行 `/focus`。该设置在会话之间保持。再次运行 `/focus` 来关闭它。

记录模式获得 `less` 风格的导航和搜索：

| 键                                   | 操作                                         |
| :---------------------------------- | :----------------------------------------- |
| `/`                                 | 打开搜索。输入以查找匹配项，`Enter` 接受，`Esc` 取消并恢复您的滚动位置 |
| `n` / `N`                           | 跳到下一个或上一个匹配项。在您关闭搜索栏后工作                    |
| `j` / `k` 或 `↑` / `↓`               | 向上或向下滚动一行                                  |
| `g` / `G` 或 `Home` / `End`          | 跳到顶部或底部                                    |
| `Ctrl+u` / `Ctrl+d`                 | 滚动半页                                       |
| `Ctrl+b` / `Ctrl+f` 或 `Space` / `b` | 滚动整页                                       |
| `Ctrl+o`、`Esc` 或 `q`                | 退出记录模式并返回到提示                               |

您的终端的 `Cmd+f` 和 tmux 搜索看不到对话，因为它存在于备用屏幕缓冲区中，而不是原生滚动历史中。要将内容交还给您的终端，请先按 `Ctrl+o` 进入记录模式，然后：

* **`[`**：将完整对话写入您的终端的原生滚动历史缓冲区，所有工具输出都已展开。对话现在是您的终端中的普通文本，因此 `Cmd+f`、tmux 复制模式和任何其他原生工具都可以搜索或选择它。长会话可能会在此过程中暂停片刻。这会持续到您使用 `Esc` 或 `q` 退出记录模式，这会将您返回到全屏渲染。下一个 `Ctrl+o` 重新开始。
* **`v`**：将对话写入临时文件并在 `$VISUAL` 或 `$EDITOR` 中打开它。

按 `Esc` 或 `q` 返回到提示。

<h2 id="clear-the-conversation">
  清除对话
</h2>

在两秒内按两次 `Ctrl+L` 来运行 `/clear` 并开始新对话。第一次按下会重新绘制屏幕并显示提示；第二次按下会清除对话。在 macOS 上，双击 `Cmd+K` 也会运行 `/clear`。

<h2 id="use-with-tmux">
  与 tmux 一起使用
</h2>

全屏渲染在 tmux 内工作，有三个注意事项。

鼠标滚轮滚动需要 tmux 的鼠标模式。如果您的 `~/.tmux.conf` 还没有启用它，请添加这一行并重新加载您的配置：

```bash theme={null}
set -g mouse on
```

没有鼠标模式，滚轮事件会转到 tmux 而不是 Claude Code。使用 `PgUp` 和 `PgDn` 的键盘滚动无论如何都可以工作。如果 Claude Code 检测到 tmux 且鼠标模式关闭，它会在启动时打印一次性提示。

全屏渲染与 iTerm2 的 tmux 集成模式不兼容，这是您使用 `tmux -CC` 进入的模式。在集成模式中，iTerm2 将每个 tmux 窗格渲染为原生分割，而不是让 tmux 绘制到终端。备用屏幕缓冲区和鼠标跟踪在那里无法正确工作：鼠标滚轮不起作用，双击可能会损坏终端状态。不要在 `tmux -CC` 会话中启用全屏渲染。常规 tmux 在 iTerm2 内，没有 `-CC`，工作正常。

并非每个 tmux 版本都应用来自应用程序的同步输出，因此在 tmux 下重绘期间您可能会看到比直接在终端中运行 Claude Code 时更多的闪烁。如果闪烁很明显，特别是在 SSH 上，请升级到最新的 tmux 或在 tmux 外的自己的终端标签页中运行 Claude Code。使用 `tmux -V` 检查您的 tmux 版本。

Claude Code 在从 `TERM_PROGRAM_VERSION` 变量检测到 tmux 3.4 或更高版本时自动打开同步输出，当无法确定版本时回退到直接查询终端以获取同步输出支持。重绘是否实际上变成原子操作取决于您的 tmux 版本是否遵守同步输出；如果您在 tmux 3.4 或更高版本下仍然看到闪烁，请升级到最新的 tmux。此检测需要 Claude Code v2.1.200 或更高版本。

<h2 id="keep-native-text-selection">
  保持原生文本选择
</h2>

鼠标捕获是最常见的摩擦点，特别是在 SSH 上或 tmux 内。当 Claude Code 捕获鼠标事件时，您的终端的原生选择时复制停止工作。您使用点击拖动进行的选择存在于 Claude Code 内，而不是在您的终端的选择缓冲区中，因此 tmux 复制模式、Kitty 提示和类似工具看不到它。

Claude Code 将选择写入您的系统剪贴板，它使用的路径取决于您的设置。在本地会话中，它运行原生剪贴板工具：

* **macOS**: `pbcopy`
* **Linux**: Wayland 上的 `wl-copy`，或 X11 上的 `xclip` 或 `xsel`（取决于安装的是哪个）。Claude Code 同时写入剪贴板和 PRIMARY 选择，因此中键粘贴可以工作。
* **Windows 和 WSL**: PowerShell `Set-Clipboard`

在 tmux 内，它也写入 tmux 粘贴缓冲区。在 SSH 上，它回退到 OSC 52 转义序列。Claude Code 在每次复制后打印一个 toast，告诉您它使用了哪个路径。

某些终端默认阻止 OSC 52。iTerm2 会阻止它，直到您打开 Settings → General → Selection → Applications in terminal may access clipboard；在 iTerm2 中运行 [`/terminal-setup`](/docs/zh-CN/terminal-config) 会为您启用此功能。

对于一次性的原生选择，要使用的键取决于您的终端：

* **Terminal.app**: `Fn`
* **iTerm2**: `Option`
* **VS Code、Cursor 和 Devin Desktop**: `Shift`，或在启用 `terminal.integrated.macOptionClickForcesSelection` 设置的 macOS 上使用 `Option`
* **大多数其他终端**: `Shift`

按住该键同时点击拖动。您的终端自己处理选择，而不是将其传递给 Claude Code，因此 `Cmd+C` 等复制快捷键可以在您选择的内容上工作。Claude Code 也会在其屏幕提示中显示正确的键。

在 SSH 上或 tmux 内，Claude Code 无法总是检测到您连接的终端，因此提示会列出候选键。

如果您一直依赖原生选择，请设置 `CLAUDE_CODE_DISABLE_MOUSE=1` 以选择退出鼠标捕获，同时保持无闪烁渲染和平稳内存：

```bash theme={null}
CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_MOUSE=1 claude
```

禁用鼠标捕获后，使用 `PgUp`、`PgDn`、`Ctrl+Home` 和 `Ctrl+End` 的键盘滚动仍然有效，您的终端原生处理选择。您会失去点击定位光标、点击展开工具输出、URL 点击和 Claude Code 内的滚轮滚动。

要保持滚轮滚动但关闭点击、拖动和悬停处理，请改为设置 `CLAUDE_CODE_DISABLE_MOUSE_CLICKS=1`。需要 Claude Code v2.1.195 或更高版本。当两个变量都设置时，`CLAUDE_CODE_DISABLE_MOUSE` 优先。

禁用点击后，Claude Code 仍然捕获鼠标，因此滚轮和触控板滚动对话，但左键点击在 Claude Code 内不起作用。您仍然需要按住终端的键进行原生点击拖动选择。右键点击和中键粘贴在支持它们的终端上继续工作。

<h2 id="troubleshooting">
  Troubleshooting
</h2>

<h3 id="stale-or-misplaced-text-on-screen">
  屏幕上出现陈旧或错位的文本
</h3>

全屏渲染仅发送帧之间更改的单元格。某些终端，最常见的是 Windows Terminal 和其他基于 ConPTY 的主机，会错误地合并这些定位写入，并在调整窗口大小之前在屏幕上留下早期输出的片段。

设置 [`CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1`](/docs/zh-CN/env-vars) 以在每一帧上重绘每个单元格，而不是发送增量更新。

在 Windows PowerShell 上：

```powershell theme={null}
$env:CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT = "1"
claude
```

在 macOS 或 Linux 上：

```bash theme={null}
CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1 claude
```

在 Windows 上，Claude Code 已经为后台会话和 [agent view](/docs/zh-CN/agent-view) 自动启用完整重绘，因此您只需要为直接启动的交互式全屏会话设置该变量。

<h2 id="research-preview">
  研究预览
</h2>

全屏渲染是一个研究预览功能。它已在常见的终端模拟器上进行了测试，但您可能会在不太常见的终端或不寻常的配置上遇到渲染问题。

如果您遇到问题，请在 Claude Code 内运行 `/feedback` 来报告它，或在 [claude-code GitHub 仓库](https://github.com/anthropics/claude-code/issues)上打开一个问题。包括您的终端模拟器名称和版本。

要关闭全屏渲染，请运行 `/tui default`，或如果您以这种方式启用了 `CLAUDE_CODE_NO_FLICKER`，请取消设置它。要强制使用经典渲染器而不管保存的 `tui` 设置，请设置 `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`。经典渲染器将对话保留在您的终端的原生滚动缓冲区中，因此 `Cmd+f` 和 tmux 复制模式可以照常工作。

从 [agent view](/docs/zh-CN/agent-view) 或 `claude attach` 打开的后台会话始终使用全屏渲染。附加终端进入备用屏幕缓冲区以显示会话，经典渲染器在那里没有滚动缓冲或鼠标处理，因此 `tui` 设置和 `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN` 不适用于它们。
