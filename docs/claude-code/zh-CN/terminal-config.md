> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 为 Claude Code 配置您的终端

> 修复 Shift+Enter 以实现换行、在 Claude 完成时获得终端铃声、配置 tmux、匹配颜色主题，以及在 Claude Code CLI 中启用 Vim 模式。

Claude Code 在任何终端中都可以无需配置而工作。此页面适用于当某些特定功能的行为不符合您的预期时。在下面找到您的症状。如果一切都已经感觉正确，您不需要此页面。

* [Shift+Enter 提交而不是插入换行](#enter-multiline-prompts)
* [Option 键快捷键在 macOS 上无效](#enable-option-key-shortcuts-on-macos)
* [Claude 完成时没有声音或警报](#get-a-terminal-bell-or-notification)
* [您在 tmux 内运行 Claude Code](#configure-tmux)
* [显示闪烁或滚动条跳跃](#switch-to-fullscreen-rendering)
* [您想在提示符中使用 Vim 快捷键](#edit-prompts-with-vim-keybindings)

此页面是关于让您的终端向 Claude Code 发送正确的信号。要更改 Claude Code 本身响应的快捷键，请改为参阅[快捷键](/docs/zh-CN/keybindings)。

<h2 id="enter-multiline-prompts">
  输入多行提示符
</h2>

按 Enter 提交您的消息。要添加换行符而不提交，请按 Ctrl+J，或输入 `\` 然后按 Enter。两者都在每个终端中工作，无需设置。

在大多数终端中，您也可以按 Shift+Enter，但支持因终端模拟器而异：

| 终端                                                                | Shift+Enter 换行               |
| :---------------------------------------------------------------- | :--------------------------- |
| Ghostty、Kitty、iTerm2、WezTerm、Warp、Apple Terminal、Windows Terminal | 无需设置即可工作                     |
| VS Code、Cursor、Devin Desktop、Alacritty、Zed                        | 运行一次 `/terminal-setup`       |
| gnome-terminal、JetBrains IDE（如 PyCharm 和 Android Studio）          | 不可用；使用 Ctrl+J 或 `\` 然后 Enter |

对于 VS Code、Cursor、Devin Desktop、Alacritty 和 Zed，`/terminal-setup` 将 Shift+Enter 和其他快捷键写入终端的配置文件。现有的绑定保持不变；如果您看到诸如 `VSCode terminal Shift+Enter key binding already configured` 之类的消息，则未进行任何更改。在主机终端中直接运行 `/terminal-setup` 而不是在 tmux 或 screen 内运行，因为它需要写入主机终端的配置。

在 VS Code、Cursor 和 Devin Desktop 中，`/terminal-setup` 还会更新两个编辑器设置：它将 `terminal.integrated.gpuAcceleration` 设置为 `"off"` 以防止集成终端中的文本乱码，并设置 `terminal.integrated.mouseWheelScrollSensitivity` 以在[全屏模式](/docs/zh-CN/fullscreen)中实现更平滑的滚动。要撤销 GPU 加速更改，请将其设置回 `"auto"` 并重新加载编辑器窗口。

如果您在 tmux 内运行，即使外部终端支持，Shift+Enter 也需要下面的 [tmux 配置](#configure-tmux)。

要将换行绑定到不同的快捷键，或交换行为使 Enter 插入换行而 Shift+Enter 提交，请在您的[快捷键](/docs/zh-CN/keybindings)文件中映射 `chat:newline` 和 `chat:submit` 操作。

<h2 id="enable-option-key-shortcuts-on-macos">
  在 macOS 上启用 Option 快捷键
</h2>

某些 Claude Code 快捷键使用 Option 键，例如 Option+Enter 换行或 Option+P 切换模型。在 macOS 上，大多数终端默认不将 Option 作为修饰符发送，因此这些快捷键在您启用它之前无效。此终端设置通常标记为"使用 Option 作为 Meta 键"；Meta 是现在标记为 Option 或 Alt 的快捷键的历史 Unix 名称。

<Tabs>
  <Tab title="Apple Terminal">
    打开设置 → 配置文件 → 键盘并勾选"使用 Option 作为 Meta 键"。

    如果您接受了 Claude Code 的首次运行提示，该提示提供了"Option+Enter 换行和视觉铃声"，这已经完成。该提示为您运行 `/terminal-setup`，它在您的 Apple Terminal 配置文件中启用 Option 作为 Meta 并将音频铃声切换为视觉屏幕闪烁。
  </Tab>

  <Tab title="iTerm2">
    打开设置 → 配置文件 → 快捷键 → 常规并将左 Option 快捷键和右 Option 快捷键设置为"Esc+"。

    在 iTerm2 中运行 `/terminal-setup` 会在设置 → 常规 → 选择下启用"终端中的应用程序可以访问剪贴板"，以便 `/copy` 命令可以写入您的系统剪贴板。该命令即使在 tmux 内运行时也能检测到 iTerm2。重启 iTerm2 以使更改生效。
  </Tab>

  <Tab title="VS Code">
    将 `"terminal.integrated.macOptionIsMeta": true` 添加到您的 VS Code 设置。
  </Tab>
</Tabs>

对于 Ghostty、Kitty 和其他终端，请在终端的配置文件中查找 Option-as-Alt 或 Option-as-Meta 设置。

<h2 id="get-a-terminal-bell-or-notification">
  获取终端铃声或通知
</h2>

当 Claude 完成任务或暂停以获得权限提示时，它会触发通知事件。将其显示为终端铃声或桌面通知可让您在长任务运行时切换到其他工作。

默认情况下，Claude Code 仅在 Ghostty、Kitty 和 iTerm2 中发送桌面通知。在其他终端中，将 [`preferredNotifChannel`](/docs/zh-CN/settings#available-settings) 设置为 `"terminal_bell"` 以改为响铃终端铃声，或配置[通知钩子](#play-a-sound-with-a-notification-hook)以获得自定义声音或命令。

桌面通知通过 SSH 到达您的本地机器，因此远程会话仍然可以提醒您。Ghostty 和 Kitty 无需进一步设置即可将其转发到您的 OS 通知中心。iTerm2 要求您启用转发：

<Steps>
  <Step title="打开 iTerm2 通知设置">
    转到设置 → 配置文件 → 终端。
  </Step>

  <Step title="启用警报">
    勾选"通知中心警报"，然后单击"过滤警报"并启用"发送转义序列生成的警报"。
  </Step>
</Steps>

如果通知仍未出现，请确认您的终端应用程序在您的 OS 设置中具有通知权限，如果您在 tmux 内运行，请[启用直通](#configure-tmux)。

<h3 id="play-a-sound-with-a-notification-hook">
  使用通知钩子播放声音
</h3>

在任何终端中，您可以配置[通知钩子](/docs/zh-CN/hooks-guide#get-notified-when-claude-needs-input)以在 Claude 需要您的注意时播放声音或运行自定义命令。钩子与内置通知一起运行，而不是替代它，因此不接收桌面通知的终端（如 Warp 或 VS Code 集成终端）可以使用钩子或将 `preferredNotifChannel` 设置为 `"terminal_bell"` 代替。

下面的示例在 macOS 上播放系统声音。链接的指南包含 macOS、Linux 和 Windows 的桌面通知命令。

```json ~/.claude/settings.json theme={null}
{
  "hooks": {
    "Notification": [
      {
        "hooks": [{ "type": "command", "command": "afplay /System/Library/Sounds/Glass.aiff" }]
      }
    ]
  }
}
```

<h2 id="configure-tmux">
  配置 tmux
</h2>

当 Claude Code 在 tmux 内运行时，默认情况下两件事会中断：Shift+Enter 提交而不是插入换行，桌面通知和[进度条](/docs/zh-CN/settings#available-settings)永远无法到达外部终端。将这些行添加到 `~/.tmux.conf`，然后运行 `tmux source-file ~/.tmux.conf` 将它们应用到运行的服务器：

```bash ~/.tmux.conf theme={null}
set -g allow-passthrough on
set -s extended-keys on
set -as terminal-features 'xterm*:extkeys'
```

`allow-passthrough` 行让通知和进度更新到达外部终端，而不是被 tmux 吞没。`extended-keys` 行让 tmux 区分 Shift+Enter 和纯 Enter，以便换行快捷键工作。

<h2 id="match-the-color-theme">
  匹配颜色主题
</h2>

使用 `/theme` 命令或 `/config` 中的主题选择器来选择与您的终端匹配的 Claude Code 主题。选择自动选项会检测您的终端的浅色或深色背景，因此主题会在您的终端执行时跟随 OS 外观更改。Claude Code 不控制终端自己的颜色方案，该方案由终端应用程序设置。

要自定义界面底部显示的内容，请配置[自定义状态行](/docs/zh-CN/statusline)，显示当前模型、工作目录、git 分支或其他上下文。

<h3 id="create-a-custom-theme">
  创建自定义主题
</h3>

<Note>
  自定义主题需要 Claude Code v2.1.118 或更高版本。
</Note>

除了内置预设外，`/theme` 还列出您定义的任何自定义主题以及已安装的 [plugins](/docs/zh-CN/plugins-reference#themes) 贡献的任何主题。选择列表末尾的\*\*新建自定义主题…\*\*以交互方式创建一个：您命名主题，然后选择要覆盖的各个颜色令牌。当自定义主题突出显示时，按 `Ctrl+E` 来编辑它。

每个自定义主题都是 `~/.claude/themes/` 中的 JSON 文件。不带 `.json` 扩展名的文件名是主题的 slug，选择主题会将 `custom:<slug>` 存储为您的主题偏好设置。该文件有三个可选字段：

| 字段          | 类型     | 描述                                                                                                  |
| :---------- | :----- | :-------------------------------------------------------------------------------------------------- |
| `name`      | string | 在 `/theme` 中显示的标签。默认为文件名 slug                                                                       |
| `base`      | string | 主题开始的内置预设：`dark`、`light`、`dark-daltonized`、`light-daltonized`、`dark-ansi` 或 `light-ansi`。默认为 `dark` |
| `overrides` | object | 颜色令牌名称到颜色值的映射。此处未列出的令牌会回退到基础预设                                                                      |

颜色值接受 `#rrggbb`、`#rgb`、`rgb(r,g,b)`、`ansi256(n)` 或 `ansi:<name>`，其中 `<name>` 是 16 个标准 ANSI 颜色名称之一，例如 `red` 或 `cyanBright`。未知令牌和无效颜色值会被忽略，因此拼写错误不会破坏渲染。

以下示例定义了一个保留深色预设但重新着色提示符强调、错误文本和成功文本的主题：

```json ~/.claude/themes/dracula.json theme={null}
{
  "name": "Dracula",
  "base": "dark",
  "overrides": {
    "claude": "#bd93f9",
    "error": "#ff5555",
    "success": "#50fa7b"
  }
}
```

Claude Code 监视 `~/.claude/themes/` 并在文件更改时重新加载，因此在您的编辑器中所做的编辑会应用到正在运行的会话中，无需重新启动。

以下参考涵盖了您可以在 `overrides` 中设置的令牌。`/theme` 中的交互式编辑器显示相同的令牌，并带有实时预览，以及一些单一用途的强调，例如此处未涵盖的入门屏幕颜色。

<Accordion title="颜色令牌参考">
  以下示例结合了以下几个组中的令牌：品牌强调、Plan Mode 边框、diff 背景和全屏消息背景。

  ```json ~/.claude/themes/midnight.json theme={null}
  {
    "name": "Midnight",
    "base": "dark",
    "overrides": {
      "claude": "#a78bfa",
      "planMode": "#38bdf8",
      "diffAdded": "#14532d",
      "diffRemoved": "#7f1d1d",
      "userMessageBackground": "#1e1b4b"
    }
  }
  ```

  <h4 id="text-and-accent-colors">
    文本和强调颜色
  </h4>

  控制整个界面中使用的主要品牌强调和前景文本阴影。

  | 令牌            | 控制                  |
  | :------------ | :------------------ |
  | `claude`      | 主要品牌强调，用于微调器和助手标签   |
  | `text`        | 默认前景文本              |
  | `inverseText` | 绘制在彩色背景顶部的文本，例如状态徽章 |
  | `inactive`    | 次要文本，例如提示、时间戳和禁用项   |
  | `subtle`      | 淡色边框和去强调的次要文本       |
  | `suggestion`  | 自动完成建议和选择器中的选择突出显示  |
  | `permission`  | 对话框边框，包括权限提示和选择器    |
  | `remember`    | 内存和 `CLAUDE.md` 指示器 |

  <h4 id="status-colors">
    状态颜色
  </h4>

  在消息和指示器中发出成功、失败和警告状态信号。

  | 令牌        | 控制             |
  | :-------- | :------------- |
  | `success` | 成功消息和通过的检查     |
  | `error`   | 错误消息和失败        |
  | `warning` | 警告、注意消息和自动模式边框 |
  | `merged`  | 合并的拉取请求状态      |

  <h4 id="input-box-and-mode-indicators">
    输入框和模式指示器
  </h4>

  设置输入框边框颜色和权限模式或指示器处于活动状态时显示的强调。

  | 令牌             | 控制                     |
  | :------------- | :--------------------- |
  | `promptBorder` | 默认权限模式下的输入框边框          |
  | `planMode`     | Plan Mode 强调和边框        |
  | `autoAccept`   | 接受编辑模式强调和边框            |
  | `bashBorder`   | 输入 `!` shell 命令时的输入框边框 |
  | `ide`          | IDE 连接指示器              |
  | `fastMode`     | 快速模式指示器                |

  <h4 id="diff-rendering">
    Diff 渲染
  </h4>

  在文件编辑和审查中为添加和删除的代码着色。

  | 令牌                  | 控制             |
  | :------------------ | :------------- |
  | `diffAdded`         | 添加行的背景         |
  | `diffRemoved`       | 删除行的背景         |
  | `diffAddedDimmed`   | 添加行附近未更改上下文的背景 |
  | `diffRemovedDimmed` | 删除行附近未更改上下文的背景 |
  | `diffAddedWord`     | 添加行内的字级突出显示    |
  | `diffRemovedWord`   | 删除行内的字级突出显示    |

  <h4 id="fullscreen-mode">
    全屏模式
  </h4>

  仅在[全屏渲染模式](/docs/zh-CN/fullscreen)中应用，其中消息具有背景填充。

  | 令牌                           | 控制                       |
  | :--------------------------- | :----------------------- |
  | `userMessageBackground`      | 成绩单中您的消息后面的背景            |
  | `userMessageBackgroundHover` | 成绩单中悬停或展开消息时消息后面的背景      |
  | `messageActionsBackground`   | 操作栏打开时所选消息后面的背景          |
  | `bashMessageBackgroundColor` | 成绩单中 `!` shell 命令条目后面的背景 |
  | `memoryBackgroundColor`      | 成绩单中 `#` 内存条目后面的背景       |
  | `selectionBg`                | 用鼠标选择的文本的背景              |

  <h4 id="usage-meter-and-speaker-labels">
    使用量计量器和发言人标签
  </h4>

  调整 `/usage` 视图中显示的条形图以及区分您的消息和 Claude 消息的标签。

  | 令牌                 | 控制                    |
  | :----------------- | :-------------------- |
  | `rate_limit_fill`  | 使用量计量器的填充部分           |
  | `rate_limit_empty` | 使用量计量器的未填充部分          |
  | `briefLabelYou`    | 您的消息上的 `You` 标签的颜色    |
  | `briefLabelClaude` | 助手消息上的 `Claude` 标签的颜色 |

  <h4 id="shimmer-variants-and-subagent-colors">
    微光变体和子代理颜色
  </h4>

  多个令牌具有配对的微光变体，提供微调器动画梯度中使用的较浅颜色。如果动画看起来不匹配，请与其基础令牌一起覆盖微光。

  * `claude` 和 `claudeShimmer`
  * `warning` 和 `warningShimmer`
  * `permission` 和 `permissionShimmer`
  * `promptBorder` 和 `promptBorderShimmer`
  * `inactive` 和 `inactiveShimmer`
  * `fastMode` 和 `fastModeShimmer`

  每个[子代理](/docs/zh-CN/sub-agents)和并行任务以八种命名颜色之一显示，以便您可以在成绩单中区分它们。令牌名称遵循 `<color>_FOR_SUBAGENTS_ONLY` 的模式，其中 `<color>` 是 `red`、`blue`、`green`、`yellow`、`purple`、`orange`、`pink` 或 `cyan`。覆盖这些以更改每个命名颜色的外观。例如，定义中具有 `color: blue` 的子代理使用 `blue_FOR_SUBAGENTS_ONLY` 值绘制。

  [`ultrathink`](/docs/zh-CN/model-config#use-ultrathink-for-one-off-deep-reasoning) 和 [`ultraplan`](/docs/zh-CN/ultraplan) 关键字在提示输入中使用七色彩虹梯度渲染。令牌名称遵循 `rainbow_<color>` 和 `rainbow_<color>_shimmer` 的模式，其中 `<color>` 是 `red`、`orange`、`yellow`、`green`、`blue`、`indigo` 或 `violet`。
</Accordion>

<h2 id="switch-to-fullscreen-rendering">
  切换到全屏渲染
</h2>

如果显示闪烁或在 Claude 工作时滚动位置跳跃，请切换到[全屏渲染模式](/docs/zh-CN/fullscreen)。它绘制到终端为全屏应用程序保留的单独屏幕，而不是附加到您的正常滚动条，这保持内存使用平稳并为滚动和选择添加鼠标支持。在此模式下，您使用鼠标或 PageUp 在 Claude Code 内滚动，而不是使用您的终端的本机滚动条；请参阅[全屏页面](/docs/zh-CN/fullscreen#search-and-review-the-conversation)了解如何搜索和复制。

如果闪烁是唯一的问题，且您的终端支持同步输出但未被自动检测，例如 Emacs `eat`，请设置 [`CLAUDE_CODE_FORCE_SYNC_OUTPUT=1`](/docs/zh-CN/env-vars) 以停止闪烁而不改变渲染器。

运行 `/tui fullscreen` 以切换并保存偏好设置。您的对话将完整重新启动，未来的会话将在全屏中启动。您也可以在启动 Claude Code 之前设置 `CLAUDE_CODE_NO_FLICKER` 环境变量：

<CodeGroup>
  ```bash Bash and Zsh theme={null}
  CLAUDE_CODE_NO_FLICKER=1 claude
  ```

  ```powershell PowerShell theme={null}
  $env:CLAUDE_CODE_NO_FLICKER = "1"; claude
  ```

  ```json ~/.claude/settings.json theme={null}
  {
    "env": {
      "CLAUDE_CODE_NO_FLICKER": "1"
    }
  }
  ```
</CodeGroup>

<h2 id="paste-large-content">
  粘贴大型内容
</h2>

当您将超过 10,000 个字符粘贴到提示符中时，Claude Code 将输入折叠为 `[Pasted text]` 占位符，以便输入框保持可用。当您提交时，完整内容仍会发送给 Claude。

VS Code 集成终端可能会在非常大的粘贴中丢弃字符，然后才能到达 Claude Code，因此在那里更喜欢基于文件的工作流。对于非常大的输入，例如整个文件或长日志，请将内容写入文件并要求 Claude 读取它，而不是粘贴。这保持对话记录可读，并让 Claude 在后续轮次中按路径引用文件。

<h2 id="edit-prompts-with-vim-keybindings">
  使用 Vim 快捷键编辑提示符
</h2>

Claude Code 包括提示符输入的 Vim 风格编辑模式。通过 `/config` → 编辑器模式启用它，或通过在 `~/.claude/settings.json` 中将 [`editorMode`](/docs/zh-CN/settings#available-settings) 设置为 `"vim"` 来启用。将编辑器模式设置回 `normal` 以关闭它。

Vim 模式支持 NORMAL 模式和 VISUAL 模式动作和运算符的子集，例如 `hjkl` 导航、`v`/`V` 选择以及 `d`/`c`/`y` 与文本对象。请参阅 [Vim 编辑器模式参考](/docs/zh-CN/interactive-mode#vim-editor-mode)了解完整的快捷键表。

Vim 动作不可通过快捷键文件重新映射。要映射两个按键的 INSERT 模式序列（例如 `jj` 到 Escape），请在用户设置中设置 [`vimInsertModeRemaps`](/docs/zh-CN/interactive-mode#remap-insert-mode-key-sequences)。

在 INSERT 模式下按 Enter 仍会提交您的提示符，与标准 Vim 不同。在 NORMAL 模式下使用 `o` 或 `O`，或 Ctrl+J，来插入换行。

<h2 id="related-resources">
  相关资源
</h2>

* [交互模式](/docs/zh-CN/interactive-mode)：完整的键盘快捷键参考和 Vim 快捷键表
* [快捷键](/docs/zh-CN/keybindings)：重新映射任何 Claude Code 快捷键，包括 Enter 和 Shift+Enter
* [全屏渲染](/docs/zh-CN/fullscreen)：全屏模式下滚动、搜索和复制的详细信息
* [钩子指南](/docs/zh-CN/hooks-guide)：Linux 和 Windows 的更多通知钩子示例
* [故障排除](/docs/zh-CN/troubleshooting)：修复终端配置之外的问题
