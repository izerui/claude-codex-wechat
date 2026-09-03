> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 交互模式

> Claude Code 会话中键盘快捷键、输入模式和交互功能的完整参考。

<h2 id="keyboard-shortcuts">
  键盘快捷键
</h2>

<Note>
  键盘快捷键可能因平台和终端而异。在[全屏渲染](/docs/zh-CN/fullscreen)中，在转录查看器中按 `?` 查看可用的快捷键。

  **macOS 用户**：Option/Alt 键快捷键（`Alt+B`、`Alt+F`、`Alt+Y`、`Alt+M`、`Alt+P`）需要在终端中将 Option 配置为 Meta：

  * **iTerm2**：设置 → 配置文件 → 键 → 常规 → 将左/右 Option 键设置为"Esc+"
  * **Apple Terminal**：设置 → 配置文件 → 键盘 → 勾选"使用 Option 作为 Meta 键"
  * **VS Code**：在 VS Code 设置中设置 `"terminal.integrated.macOptionIsMeta": true`

  有关详细信息，请参阅[终端配置](/docs/zh-CN/terminal-config)。
</Note>

<h3 id="general-controls">
  常规控制
</h3>

| 快捷键                                                | 描述                                                                                           | 上下文                                                                                                                                   |
| :------------------------------------------------- | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `Ctrl+C`                                           | 中断，或清除输入                                                                                     | 中断正在运行的操作。如果没有任何操作在运行，第一次按下会清除提示输入，第二次按下会退出 Claude Code                                                                               |
| `Ctrl+X Ctrl+K`                                    | 终止此会话中所有运行的[后台子代理](/docs/zh-CN/sub-agents#run-subagents-in-foreground-or-background)。在 3 秒内按两次以确认 | 子代理控制                                                                                                                                 |
| `Ctrl+D`                                           | 退出 Claude Code 会话                                                                            | EOF 信号                                                                                                                                |
| `Ctrl+G` 或 `Ctrl+X Ctrl+E`                         | 在默认文本编辑器中打开                                                                                  | 在默认文本编辑器中编辑您的提示或自定义响应。`Ctrl+X Ctrl+E` 是 readline 原生绑定。在 `/config` 中打开"在外部编辑器中显示最后响应"以在您的提示上方将 Claude 的上一个回复作为 `#` 注释上下文预置；保存时会删除注释块   |
| `Ctrl+L`                                           | 重绘屏幕                                                                                         | 强制完整的终端重绘。输入和对话历史被保留。使用此功能可在显示变得混乱或部分空白时恢复                                                                                            |
| `Ctrl+O`                                           | 切换转录查看器                                                                                      | 显示详细的工具使用和执行情况，每个助手消息上都有时间戳和使用的模型。还会展开 MCP 调用，这些调用默认会折叠为单行，如"Called slack 3 times"                                                    |
| `Ctrl+R`                                           | 反向搜索命令历史                                                                                     | 交互式搜索以前的命令                                                                                                                            |
| `Ctrl+V` 或 `Cmd+V`（iTerm2）或 `Alt+V`（Windows 和 WSL） | 从剪贴板粘贴图像                                                                                     | 在光标处插入 `[Image #N]` 芯片，以便您可以在提示中按位置引用它。在 WSL 上，`Ctrl+V` 和 `Alt+V` 都被绑定；如果您的终端拦截 `Ctrl+V`，请使用 `Alt+V`                                  |
| `Ctrl+B`                                           | 后台运行任务                                                                                       | 后台运行 Bash 命令和代理。Tmux 用户按两次                                                                                                            |
| `Ctrl+T`                                           | 切换 Claude 的任务清单                                                                              | 在状态区域中显示或隐藏 [Claude 的待办事项清单](#task-list)。这不是后台任务视图；使用 [`/tasks`](/docs/zh-CN/commands) 查看运行的 shell 和子代理                                    |
| `Left/Right arrows`                                | 在对话框选项卡之间循环                                                                                  | 在权限对话框和菜单中的选项卡之间导航                                                                                                                    |
| `Up/Down arrows` 或 `Ctrl+P`/`Ctrl+N`               | 移动光标或导航命令历史                                                                                  | 当输入跨越多个可视行时，无论是换行还是多行，首先在提示内移动光标。一旦光标在第一行或最后一行，再次按下会导航命令历史。从 v2.1.169 开始，换行的单行输入的行为与多行输入相同                                            |
| `Esc`                                              | 中断 Claude，或关闭对话框                                                                             | 停止当前响应或工具调用中途，以便您可以重定向。Claude 保留迄今为止完成的工作。当权限提示等对话框打开时，`Esc` 关闭对话框而不是中断 Claude。在 v2.1.202 之前，某些对话框上的 `Esc` 会中断 Claude 并保持对话框打开        |
| `Esc` + `Esc`                                      | 清除输入草稿，或回退                                                                                   | 当提示输入包含文本时，双 `Esc` 会清除它并将草稿保存到历史记录中，以便 `Up` 可以调用它。当输入为空时，双 `Esc` 会打开[回退菜单](/docs/zh-CN/checkpointing)以从上一个点恢复或总结代码和对话                      |
| `Shift+Tab` 或 `Alt+M`（某些配置）                        | 循环权限模式                                                                                       | 在 `default`（在模式指示器中标记为 Manual）、`acceptEdits`、`plan` 和您启用的任何模式（如 `auto` 或 `bypassPermissions`）之间循环。请参阅[权限模式](/docs/zh-CN/permission-modes)。 |
| `Option+P`（macOS）或 `Alt+P`（Windows/Linux）          | 切换模型                                                                                         | 在不清除提示的情况下切换模型                                                                                                                        |
| `Option+T`（macOS）或 `Alt+T`（Windows/Linux）          | 切换扩展思考                                                                                       | 启用或禁用扩展思考模式。对 Fable 5 无效，它始终使用扩展思考。从 v2.1.132 开始，此快捷键在 macOS 上无需配置 Option 作为 Meta 即可工作                                                |
| `Option+O`（macOS）或 `Alt+O`（Windows/Linux）          | 切换快速模式                                                                                       | 启用或禁用[快速模式](/docs/zh-CN/fast-mode)                                                                                                         |

<h3 id="text-editing">
  文本编辑
</h3>

| 快捷键                    | 描述           | 上下文                                                                                           |
| :--------------------- | :----------- | :-------------------------------------------------------------------------------------------- |
| `Ctrl+A`               | 将光标移动到当前行的开始 | 在多行输入中，移动到当前逻辑行的开始                                                                            |
| `Ctrl+E`               | 将光标移动到当前行的末尾 | 在多行输入中，移动到当前逻辑行的末尾                                                                            |
| `Ctrl+K`               | 删除到行尾        | 存储已删除的文本以供粘贴                                                                                  |
| `Ctrl+U`               | 从光标删除到行首     | 存储已删除的文本以供粘贴。重复以清除多行输入中的多行。在 macOS 上，终端模拟器（包括 iTerm2 和 Terminal.app）将 `Cmd+Backspace` 映射到此快捷键 |
| `Ctrl+W`               | 删除上一个单词      | 存储已删除的文本以供粘贴。在 Windows 上，`Ctrl+Backspace` 也会删除上一个单词                                           |
| `Ctrl+Y`               | 粘贴已删除的文本     | 粘贴用 `Ctrl+K`、`Ctrl+U` 或 `Ctrl+W` 删除的文本                                                        |
| `Alt+Y`（在 `Ctrl+Y` 之后） | 循环粘贴历史       | 粘贴后，循环浏览以前删除的文本。在 macOS 上需要[将 Option 作为 Meta](#keyboard-shortcuts)                            |
| `Alt+B`                | 将光标向后移动一个单词  | 单词导航。在 macOS 上需要[将 Option 作为 Meta](#keyboard-shortcuts)                                       |
| `Alt+F`                | 将光标向前移动一个单词  | 单词导航。在 macOS 上需要[将 Option 作为 Meta](#keyboard-shortcuts)                                       |

<h3 id="theme-and-display">
  主题和显示
</h3>

| 快捷键      | 描述           | 上下文                                           |
| :------- | :----------- | :-------------------------------------------- |
| `Ctrl+T` | 切换代码块的语法突出显示 | 仅在 `/theme` 选择器菜单内工作。控制 Claude 响应中的代码是否使用语法着色 |

<h3 id="multiline-input">
  多行输入
</h3>

| 方法          | 快捷键            | 上下文                                                                                          |
| :---------- | :------------- | :------------------------------------------------------------------------------------------- |
| 快速转义        | `\` + `Enter`  | 在所有终端中工作                                                                                     |
| Option 键    | `Option+Enter` | 在 macOS 上启用[将 Option 作为 Meta](/docs/zh-CN/terminal-config#enable-option-key-shortcuts-on-macos) 后 |
| Shift+Enter | `Shift+Enter`  | 在 iTerm2、WezTerm、Ghostty、Kitty、Warp、Apple Terminal、Windows Terminal 中开箱即用                    |
| 控制序列        | `Ctrl+J`       | 在任何终端中工作，无需配置                                                                                |
| 粘贴模式        | 直接粘贴           | 对于代码块、日志                                                                                     |

<Tip>
  Shift+Enter 在 iTerm2、WezTerm、Ghostty、Kitty、Warp、Apple Terminal 和 Windows Terminal 中无需配置即可工作。对于 VS Code、Cursor、Devin Desktop、Alacritty 和 Zed，运行 `/terminal-setup` 以安装绑定。
</Tip>

<h3 id="quick-commands">
  快速命令
</h3>

| 快捷键     | 描述        | 注释                                          |
| :------ | :-------- | :------------------------------------------ |
| `/` 在开始 | 命令或 skill | 请参阅[命令](#commands)和 [skills](/docs/zh-CN/skills) |
| `!` 在开始 | Shell 模式  | 直接运行命令，将其输出添加到会话，并让 Claude 对其进行响应           |
| `@`     | 文件路径提及    | 触发文件路径自动完成                                  |

<h3 id="transcript-viewer">
  转录查看器
</h3>

当转录查看器打开时（使用 `Ctrl+O` 切换），这些快捷键可用。在[全屏渲染](/docs/zh-CN/fullscreen)中，按 `?` 显示查看器内的完整快捷键参考面板。`Ctrl+E` 可以通过 [`transcript:toggleShowAll`](/docs/zh-CN/keybindings) 重新绑定。

| 快捷键                | 描述                                                                                                                |
| :----------------- | :---------------------------------------------------------------------------------------------------------------- |
| `?`                | 切换键盘快捷键帮助面板。需要[全屏渲染](/docs/zh-CN/fullscreen)                                                                           |
| `{` / `}`          | 跳转到上一个或下一个用户提示，如 vim 段落运动。需要[全屏渲染](/docs/zh-CN/fullscreen)                                                             |
| `Ctrl+E`           | 切换显示所有内容                                                                                                          |
| `[`                | 将完整对话写入终端的原生滚动缓冲区，以便 `Cmd+F`、tmux 复制模式和其他原生工具可以搜索它。需要[全屏渲染](/docs/zh-CN/fullscreen#search-and-review-the-conversation) |
| `v`                | 将对话写入临时文件并在 `$VISUAL` 或 `$EDITOR` 中打开它。需要[全屏渲染](/docs/zh-CN/fullscreen)                                                |
| `q`、`Ctrl+C`、`Esc` | 退出转录视图。所有三个都可以通过 [`transcript:exit`](/docs/zh-CN/keybindings) 重新绑定                                                     |

<h3 id="voice-input">
  语音输入
</h3>

| 快捷键           | 描述   | 注释                                                                                                                         |
| :------------ | :--- | :------------------------------------------------------------------------------------------------------------------------- |
| 按住或点击 `Space` | 语音听写 | 需要启用[语音听写](/docs/zh-CN/voice-dictation)。按住以录制，或运行 `/voice tap` 以进行点击切换。[可重新绑定](/docs/zh-CN/voice-dictation#rebind-the-dictation-key) |

<h2 id="commands">
  命令
</h2>

在 Claude Code 中键入 `/` 以查看所有可用命令，或键入 `/` 后跟任何字母以进行筛选。`/` 菜单显示您可以调用的所有内容：内置命令、捆绑的和用户编写的 [skills](/docs/zh-CN/skills)，以及由 [plugins](/docs/zh-CN/plugins) 和 [MCP servers](/docs/zh-CN/mcp#use-mcp-prompts-as-commands) 贡献的命令。并非所有内置命令对每个用户都可见，因为某些命令取决于您的平台或计划。

在[全屏渲染](/docs/zh-CN/fullscreen#use-the-mouse)中，`/` 命令和 `@` 文件建议列表也响应鼠标：悬停突出显示一行，单击接受它。

有关 Claude Code 中包含的命令的完整列表，请参阅[命令参考](/docs/zh-CN/commands)。

<h2 id="vim-editor-mode">
  Vim 编辑器模式
</h2>

通过 `/config` → 编辑器模式启用 vim 风格编辑。

<h3 id="mode-switching">
  重新映射 INSERT 模式快捷键序列
</h3>

[`vimInsertModeRemaps`](/docs/zh-CN/settings#available-settings) 设置将两个按键的 INSERT 模式序列映射到 Escape，因此像 `jj` 这样的映射会让你返回 NORMAL 模式。需要 Claude Code v2.1.208 或更高版本。

以下 `~/.claude/settings.json` 示例打开 vim 模式并将 `jj` 映射到 Escape：

```json theme={null}
{
  "editorMode": "vim",
  "vimInsertModeRemaps": { "jj": "<Esc>" }
}
```

每个键恰好是按顺序输入的两个可打印字符，`"<Esc>"` 是唯一支持的目标。具有不同长度或目标的条目将被忽略。

输入序列的第一个字符会正常插入。在一秒内按下第二个字符会移除该待处理字符并切换到 NORMAL 模式，在你的输入中不留下任何字符。在一秒窗口之后，或者如果按下不同的键，两个字符都会保留为文字文本，因此你仍然可以通过在两个键之间暂停来输入包含该序列的单词。

Claude Code 仅从你的用户设置文件、`--settings` 标志和[托管设置](/docs/zh-CN/permissions#managed-settings)读取此设置。项目的 `.claude/settings.json` 或 `.claude/settings.local.json` 中的条目被忽略，因此已检出的存储库无法重新映射你的按键。

<h3 id="remap-insert-mode-key-sequences">
  模式切换
</h3>

| 命令    | 操作           | 来自模式          |
| :---- | :----------- | :------------ |
| `Esc` | 进入 NORMAL 模式 | INSERT、VISUAL |
| `i`   | 在光标前插入       | NORMAL        |
| `I`   | 在行首插入        | NORMAL        |
| `a`   | 在光标后插入       | NORMAL        |
| `A`   | 在行尾插入        | NORMAL        |
| `o`   | 在下方打开行       | NORMAL        |
| `O`   | 在上方打开行       | NORMAL        |
| `v`   | 开始字符级可视选择    | NORMAL        |
| `V`   | 开始行级可视选择     | NORMAL        |

<h3 id="navigation-normal-mode">
  导航（NORMAL 模式）
</h3>

| 命令              | 操作                                                                            |
| :-------------- | :---------------------------------------------------------------------------- |
| `h`/`j`/`k`/`l` | 向左/向下/向上/向右移动                                                                 |
| `Space`         | 向右移动                                                                          |
| `w`             | 下一个单词                                                                         |
| `e`             | 单词末尾                                                                          |
| `b`             | 上一个单词                                                                         |
| `0`             | 行首                                                                            |
| `$`             | 行尾                                                                            |
| `^`             | 第一个非空白字符                                                                      |
| `gg`            | 输入开始                                                                          |
| `G`             | 输入结束                                                                          |
| `f{char}`       | 跳转到下一个字符出现处                                                                   |
| `F{char}`       | 跳转到上一个字符出现处                                                                   |
| `t{char}`       | 跳转到下一个字符出现处之前                                                                 |
| `T{char}`       | 跳转到上一个字符出现处之后                                                                 |
| `;`             | 重复最后一个 f/F/t/T 动作                                                             |
| `,`             | 反向重复最后一个 f/F/t/T 动作                                                           |
| `/`             | 打开反向历史搜索，与 `Ctrl+R` 相同。从 v2.1.191 开始，空搜索提示显示一个提示：按 `Esc` 然后 `i` 然后 `/` 打开命令菜单 |

<Note>
  在 vim 正常模式下，如果光标在输入的开始或结束处且无法进一步移动，`j`/`k` 和箭头键将导航命令历史。
</Note>

<h3 id="editing-normal-mode">
  编辑（NORMAL 模式）
</h3>

| 命令             | 操作          |
| :------------- | :---------- |
| `x`            | 删除字符        |
| `dd`           | 删除行         |
| `D`            | 删除到行尾       |
| `dw`/`de`/`db` | 删除单词/到末尾/向后 |
| `cc`           | 更改行         |
| `C`            | 更改到行尾       |
| `cw`/`ce`/`cb` | 更改单词/到末尾/向后 |
| `yy`/`Y`       | 复制行         |
| `yw`/`ye`/`yb` | 复制单词/到末尾/向后 |
| `p`            | 在光标后粘贴      |
| `P`            | 在光标前粘贴      |
| `>>`           | 缩进行         |
| `<<`           | 取消缩进行       |
| `J`            | 连接行         |
| `u`            | 撤销          |
| `.`            | 重复最后一个更改    |

<h3 id="text-objects-normal-mode">
  文本对象（NORMAL 模式）
</h3>

文本对象与 `d`、`c` 和 `y` 等运算符一起工作：

| 命令        | 操作               |
| :-------- | :--------------- |
| `iw`/`aw` | 内部/周围单词          |
| `iW`/`aW` | 内部/周围 WORD（空白分隔） |
| `i"`/`a"` | 内部/周围双引号         |
| `i'`/`a'` | 内部/周围单引号         |
| `i(`/`a(` | 内部/周围括号          |
| `i[`/`a[` | 内部/周围方括号         |
| `i{`/`a{` | 内部/周围大括号         |

<h3 id="visual-mode">
  可视模式
</h3>

按 `v` 进行字符级选择或按 `V` 进行行级选择。动作扩展选择，运算符直接作用于选择。

| 命令               | 操作                   |
| :--------------- | :------------------- |
| `d`/`x`          | 删除选择                 |
| `y`              | 复制选择                 |
| `c`/`s`          | 更改选择                 |
| `p`              | 用寄存器内容替换选择           |
| `r{char}`        | 将每个选定的字符替换为 `{char}` |
| `~`/`u`/`U`      | 切换、小写或大写选择           |
| `>`/`<`          | 缩进或取消缩进选定的行          |
| `J`              | 连接选定的行               |
| `o`              | 交换光标和锚点              |
| `iw`/`aw`/`i"`/… | 选择文本对象               |
| `v`/`V`          | 在字符级和行级之间切换，或退出      |

不支持使用 `Ctrl+V` 的块级可视模式。

<h2 id="command-history">
  命令历史
</h2>

Claude Code 为当前会话维护命令历史：

* 输入历史按工作目录存储
* 当您运行 `/clear` 以启动新会话时，输入历史会重置。上一个会话的对话被保留并可以恢复。
* 连续两次提交相同的提示会记录一个历史条目，因此按向上箭头会跳转到上一个不同的提示
* 使用向上/向下箭头导航（请参阅上面的快捷键）
* 历史扩展（`!`）默认禁用

<h3 id="reverse-search-with-ctrl-r">
  使用 Ctrl+R 反向搜索
</h3>

按 `Ctrl+R` 以交互方式搜索您的命令历史：

1. **开始搜索**：按 `Ctrl+R` 激活反向历史搜索
2. **键入查询**：输入文本以在以前的命令中搜索。搜索词在匹配结果中突出显示
3. **导航匹配**：再次按 `Ctrl+R` 以循环浏览较旧的匹配
4. **更改范围**：搜索默认为来自所有项目的提示。按 `Ctrl+S` 在此会话、此项目和所有项目之间循环范围
5. **接受匹配**：
   * 按 `Tab` 或 `Esc` 接受当前匹配并继续编辑
   * 按 `Enter` 接受并立即执行命令
6. **取消搜索**：
   * 按 `Ctrl+C` 取消并恢复原始输入
   * 在空搜索上按 `Backspace` 以取消

搜索加载所选范围内最近的 100 个唯一提示，重复项折叠到最新出现。匹配的提示显示时搜索词突出显示，因此您可以找到并重用以前的输入。

接受匹配或取消搜索会立即生效，即使 Claude Code 仍在加载历史记录。在 v2.1.202 之前，在加载期间接受或取消可能会报告内部错误。

<h2 id="background-bash-commands">
  后台 Bash 命令
</h2>

Claude Code 支持在后台运行 Bash 命令，允许您在长时间运行的进程执行时继续工作。

<h3 id="how-backgrounding-works">
  后台运行的工作原理
</h3>

当 Claude Code 在后台运行命令时，它异步运行命令并立即返回后台任务 ID。Claude Code 可以在命令继续在后台执行时响应新提示。

要在后台运行命令，您可以：

* 提示 Claude Code 在后台运行命令
* 按 `Ctrl+B` 将常规 Bash 工具调用移到后台。Tmux 用户必须按 `Ctrl+B` 两次，因为 tmux 的前缀键。

**主要功能：**

* 输出被写入文件，Claude 可以使用 Read 工具检索它
* 后台任务具有唯一的 ID 用于跟踪和输出检索
* 当 Claude Code 退出时，后台任务会自动清理。将会话放在后台而不是退出会将它们交给后台会话，它们会继续运行。请参阅[在会话内部将其放在后台](/docs/zh-CN/agent-view#from-inside-a-session)
* 如果输出超过 5GB，后台任务会自动终止，stderr 中会有说明原因的注释
* 从 v2.1.193 开始，在 macOS 和 Linux 上，当操作系统发出内存压力信号时，运行中的后台任务会被终止，前提是会话已经空闲至少 30 分钟，没有任何轮次或子代理运行。将 [`CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP`](/docs/zh-CN/env-vars) 设置为 `1` 以关闭此功能

要禁用所有后台任务功能，请将 `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` 环境变量设置为 `1`。有关详细信息，请参阅[环境变量](/docs/zh-CN/env-vars)。

**常见的后台命令：**

* 构建工具（webpack、vite、make）
* 包管理器（npm、yarn、pnpm）
* 测试运行器（jest、pytest）
* 开发服务器
* 长时间运行的进程（docker、terraform）

<h3 id="shell-mode-with-prefix">
  使用 `!` 前缀的 Shell 模式
</h3>

通过在输入前加上 `!` 来直接运行 shell 命令，无需通过 Claude：

```bash theme={null}
! npm test
! git status
! ls -la
```

Shell 模式：

* 将命令及其输出添加到对话上下文
* 显示实时进度和输出
* 支持相同的 `Ctrl+B` 后台运行长时间运行的命令
* 不需要 Claude 解释或批准命令
* 支持基于历史的自动完成：键入部分命令并按 `Tab` 以从当前项目中的上一个 `!` 命令完成
* 从 v2.1.193 开始在所有平台上支持实时文件路径自动完成：键入包含正斜杠的令牌，例如 `./src/` 或 `~/`，以查看匹配文件和目录的下拉列表，然后按 `Tab` 接受。在 Windows 上也使用正斜杠；下拉列表由 `/` 触发，而不是 `\`
* 在空提示上使用 `Escape`、`Backspace` 或 `Ctrl+U` 退出
* 将以 `!` 开头的文本粘贴到空提示中会自动进入 shell 模式，与键入的 `!` 行为相匹配

从 v2.1.186 开始，Claude 在命令输出进入记录后会自动响应，因此您可以运行 `! npm test` 并获得失败的解释，无需第二个提示。响应成本与发送普通提示相同。要恢复早期行为（其中输出被添加到上下文而不响应），请在 `settings.json` 中将 [`respondToBashCommands`](/docs/zh-CN/settings#available-settings) 设置为 `false`。在 v2.1.186 之前，shell 模式始终将输出添加到上下文而不响应。

这对于快速 shell 操作同时保持对话上下文很有用。

<h2 id="prompt-suggestions">
  提示建议
</h2>

当您首次打开会话时，灰显的示例命令会出现在提示输入中以帮助您入门。Claude Code 从您的项目的 git 历史中选择此命令，因此它反映了您最近一直在处理的文件。

Claude 响应后，建议会根据您的对话历史继续出现，例如多部分请求的后续步骤或工作流的自然延续。

* 按 `Tab` 或 `Right arrow` 将建议放入提示输入中，然后按 `Enter` 提交
* 开始输入以关闭它

建议作为后台请求运行，该请求重用父对话的 prompt cache，因此额外成本最小。当缓存冷时，Claude Code 会跳过建议生成以避免不必要的成本。

在对话的第一轮之后以及在 Plan Mode 中，建议会自动跳过。在打印模式下，它们默认关闭。传递 [`--prompt-suggestions`](/docs/zh-CN/cli-reference#cli-flags) 与 `--output-format stream-json --verbose` 以在每轮之后发出 `prompt_suggestion` 消息。

要完全禁用提示建议，请设置环境变量或在 `/config` 中切换设置：

```bash theme={null}
export CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false
```

<h2 id="side-questions-with-/btw">
  使用 /btw 的侧面问题
</h2>

使用 `/btw` 快速提问您当前的工作，而不添加到对话历史。当您想要快速答案但不想混乱主要上下文或使 Claude 偏离长时间运行的任务时，这很有用。

```
/btw what was the name of that config file again?
```

侧面问题可以完全看到当前对话，因此您可以询问 Claude 已经读过的代码、它之前做出的决定或会话中的任何其他内容。问题和答案是短暂的：它们出现在可关闭的覆盖层中，永远不会进入对话历史。

* **Claude 工作时可用**：即使 Claude 正在处理响应时，您也可以运行 `/btw`。侧面问题独立运行，不会中断主要轮次。
* **无工具访问**：侧面问题仅从已在上下文中的内容回答。Claude 在回答侧面问题时无法读取文件、运行命令或搜索。
* **单一响应**：覆盖层中没有后续轮次。要继续该线程，请使用 `f` 将其分叉到自己的会话中。
* **低成本**：侧面问题重用父对话的提示缓存，因此额外成本最小。

来自同一会话的较早侧面问题显示为当前答案上方的暗淡列表。它们保持在对话历史之外，但在覆盖层中保持可见，直到您清除它们。

答案出现后，覆盖层接受这些按键。

| 按键                       | 操作                                                                                              |
| :----------------------- | :---------------------------------------------------------------------------------------------- |
| `Space`、`Enter`、`Escape` | 关闭答案并返回提示                                                                                       |
| `Up` / `Down`            | 滚动答案                                                                                            |
| `Left` / `Right`         | 在此答案和您来自会话的较早 `/btw` 答案之间切换。`Left` 移动到较早的答案，`Right` 返回到当前答案。需要 Claude Code v2.1.187 或更高版本       |
| `c`                      | 将答案作为原始 Markdown 复制到您的剪贴板。使用此方法而不是鼠标选择，后者会捕获硬换行的终端呈现而不是源文本                                      |
| `f`                      | 分叉到新会话。分叉继承父对话加上此问题和答案作为真实记录轮次，因此您可以继续使用完整工具访问。原始会话保留在 [`/resume`](/docs/zh-CN/commands) 下。仅在本地会话中可用 |
| `x`                      | 清除当前答案上方显示的较早 `/btw` 交换列表                                                                       |

`/btw` 是 [subagent](/docs/zh-CN/sub-agents) 的反面：它看到您的完整对话但没有工具，而 subagent 具有完整工具但从空上下文开始。使用 `/btw` 询问 Claude 从此会话已知的内容；使用 subagent 去发现新的东西。

<h2 id="task-list">
  任务列表
</h2>

任务列表是 Claude 的待办事项清单：Claude 创建的用于规划多步骤工作的项目，带有指示器显示待处理、进行中或完成的内容。它与后台任务视图分开。要查看运行中的 shell 和子代理，请改用 [`/tasks`](/docs/zh-CN/commands)。

* 按 `Ctrl+T` 切换任务列表视图。显示一次最多五个任务。当 Claude 还没有创建任何清单项目时，切换没有可见效果，因为没有任何内容可显示
* 要查看所有任务或清除它们，直接询问 Claude："show me all tasks"或"clear all tasks"
* 任务在上下文压缩中持续存在，帮助 Claude 在较大的项目上保持组织
* 要在会话之间共享任务列表，请设置 `CLAUDE_CODE_TASK_LIST_ID` 以使用 `~/.claude/tasks/` 中的命名目录：`CLAUDE_CODE_TASK_LIST_ID=my-project claude`

<h2 id="session-recap">
  会话回顾
</h2>

当您从离开后返回终端时，Claude Code 会显示到目前为止会话中发生的情况的单行回顾。回顾在后台生成，一旦自上次完成的轮次以来至少已经过了三分钟且终端未聚焦，就会生成，因此当您切换回来时已准备好。回顾仅在会话至少有三个轮次后出现，并且永远不会连续出现两次。

运行 `/recap` 以按需生成摘要。要关闭自动回顾，打开 `/config` 并禁用**会话回顾**。

会话回顾在每个计划和提供商上默认启用。回顾在非交互模式下始终被跳过。

<h2 id="pr-review-status">
  PR 审查状态
</h2>

在处理具有开放拉取请求的分支时，Claude Code 在页脚中显示可点击的 PR 链接，例如"PR #446"。该链接具有彩色下划线，指示审查状态：

* 绿色：已批准
* 黄色：待审查
* 红色：请求更改
* 灰色：草稿

拉取请求合并或关闭后，徽章消失。`Cmd+click`（macOS）或 `Ctrl+click`（Windows/Linux）点击链接以在浏览器中打开拉取请求。状态每 60 秒刷新一次，并在会话中运行 `gh pr` 或 `git push` 命令后立即刷新。

<Note>
  PR 状态需要安装并验证 `gh` CLI（`gh auth login`）。
</Note>

<h2 id="see-also">
  另请参阅
</h2>

* [Skills](/docs/zh-CN/skills) - 自定义提示和工作流
* [Checkpointing](/docs/zh-CN/checkpointing) - 回退 Claude 的编辑并恢复以前的状态
* [CLI 参考](/docs/zh-CN/cli-reference) - 命令行标志和选项
* [设置](/docs/zh-CN/settings) - 配置选项
* [内存管理](/docs/zh-CN/memory) - 管理 CLAUDE.md 文件
