> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 自定义快捷键

> 使用快捷键配置文件在 Claude Code 中自定义快捷键。

Claude Code 支持可自定义的快捷键。运行 `/keybindings` 来创建或打开位于 `~/.claude/keybindings.json` 的配置文件。

<h2 id="configuration-file">
  配置文件
</h2>

快捷键配置文件是一个包含 `bindings` 数组的对象。每个块指定一个上下文和一个按键映射到操作的映射。

<Note>快捷键文件的更改会自动检测并应用，无需重启 Claude Code。</Note>

| 字段         | 描述                            |
| :--------- | :---------------------------- |
| `$schema`  | 可选的 JSON Schema URL，用于编辑器自动完成 |
| `$docs`    | 可选的文档 URL                     |
| `bindings` | 按上下文分组的绑定块数组                  |

此示例将 `Ctrl+E` 绑定到在聊天上下文中打开外部编辑器，并取消绑定 `Ctrl+U`：

```json theme={null}
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "$docs": "https://code.claude.com/docs/zh-CN/keybindings",
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+e": "chat:externalEditor",
        "ctrl+u": null
      }
    }
  ]
}
```

<h2 id="contexts">
  上下文
</h2>

每个绑定块指定一个**上下文**，其中绑定适用：

| 上下文               | 描述                |
| :---------------- | :---------------- |
| `Global`          | 在应用程序的任何地方应用      |
| `Chat`            | 主聊天输入区域           |
| `Autocomplete`    | 自动完成菜单已打开         |
| `Settings`        | 设置菜单              |
| `Confirmation`    | 权限和确认对话框          |
| `Tabs`            | 选项卡导航组件           |
| `Help`            | 帮助菜单可见            |
| `Transcript`      | 记录查看器             |
| `HistorySearch`   | 历史搜索模式（Ctrl+R）    |
| `Task`            | 后台任务正在运行          |
| `ThemePicker`     | 主题选择器对话框          |
| `Attachments`     | 图像附件在选择对话框中的导航    |
| `Footer`          | 页脚指示器导航（任务、团队、差异） |
| `MessageSelector` | 回溯和总结对话框消息选择      |
| `DiffDialog`      | 差异查看器导航           |
| `ModelPicker`     | 模型选择器工作量级别        |
| `Select`          | 通用选择/列表组件         |
| `Plugin`          | 插件对话框（浏览、发现、管理）   |
| `Scroll`          | 对话滚动和全屏模式下的文本选择   |

在 v2.1.205 之前，`/doctor` 诊断屏幕存在 `Doctor` 上下文和 `doctor:fix` 操作。

<h2 id="available-actions">
  可用操作
</h2>

操作遵循 `namespace:action` 格式，例如 `chat:submit` 发送消息或 `app:toggleTodos` 显示任务列表。每个上下文都有特定的可用操作。

<h3 id="app-actions">
  应用程序操作
</h3>

在 `Global` 上下文中可用的操作：

| 操作                     | 默认     | 描述                                                          |
| :--------------------- | :----- | :---------------------------------------------------------- |
| `app:interrupt`        | Ctrl+C | 取消当前操作                                                      |
| `app:exit`             | Ctrl+D | 退出 Claude Code                                              |
| `app:redraw`           | （未绑定）  | 强制终端重绘                                                      |
| `app:toggleTodos`      | Ctrl+T | 切换 Claude 待办事项清单的可见性。这不是 [`/tasks`](/docs/zh-CN/commands) 后台任务视图 |
| `app:toggleTranscript` | Ctrl+O | 切换详细记录                                                      |

<h3 id="history-actions">
  历史操作
</h3>

用于导航命令历史的操作：

| 操作                 | 默认     | 描述     |
| :----------------- | :----- | :----- |
| `history:search`   | Ctrl+R | 打开历史搜索 |
| `history:previous` | Up     | 上一个历史项 |
| `history:next`     | Down   | 下一个历史项 |

<h3 id="chat-actions">
  聊天操作
</h3>

在 `Chat` 上下文中可用的操作：

| 操作                    | 默认                             | 描述                                                                                 |
| :-------------------- | :----------------------------- | :--------------------------------------------------------------------------------- |
| `chat:cancel`         | Escape                         | 取消当前输入                                                                             |
| `chat:clearInput`     | Ctrl+L                         | 强制全屏重绘，保留输入。在[全屏渲染](/docs/zh-CN/fullscreen#clear-the-conversation)中，在两秒内按两次以运行 `/clear` |
| `chat:clearScreen`    | Cmd+K                          | 在[全屏渲染](/docs/zh-CN/fullscreen#clear-the-conversation)中，在两秒内按两次以运行 `/clear`             |
| `chat:killAgents`     | Ctrl+X Ctrl+K                  | 终止所有运行中的[后台子代理](/docs/zh-CN/sub-agents#run-subagents-in-foreground-or-background)在此会话中  |
| `chat:cycleMode`      | Shift+Tab\*                    | 循环权限模式                                                                             |
| `chat:modelPicker`    | Meta+P                         | 打开模型选择器                                                                            |
| `chat:fastMode`       | Meta+O                         | 切换快速模式                                                                             |
| `chat:thinkingToggle` | Meta+T                         | 切换扩展思考                                                                             |
| `chat:submit`         | Enter                          | 提交消息                                                                               |
| `chat:newline`        | Ctrl+J                         | 插入换行符而不提交                                                                          |
| `chat:undo`           | Ctrl+\_, Ctrl+Shift+-          | 撤销上一个操作                                                                            |
| `chat:externalEditor` | Ctrl+G, Ctrl+X Ctrl+E          | 在外部编辑器中打开                                                                          |
| `chat:stash`          | Ctrl+S                         | 隐藏当前提示                                                                             |
| `chat:imagePaste`     | Ctrl+V（Windows 和 WSL 上为 Alt+V） | 从剪贴板粘贴图像。在 WSL 上，默认情况下两个快捷键都已绑定                                                    |

\*在没有 VT 模式的 Windows 上（Node \<24.2.0/\<22.17.0，Bun \<1.2.23），默认为 Meta+M。

<h3 id="autocomplete-actions">
  自动完成操作
</h3>

在 `Autocomplete` 上下文中可用的操作：

| 操作                      | 默认     | 描述    |
| :---------------------- | :----- | :---- |
| `autocomplete:accept`   | Tab    | 接受建议  |
| `autocomplete:dismiss`  | Escape | 关闭菜单  |
| `autocomplete:previous` | Up     | 上一个建议 |
| `autocomplete:next`     | Down   | 下一个建议 |

<h3 id="confirmation-actions">
  确认操作
</h3>

在 `Confirmation` 上下文中可用的操作：

| 操作                          | 默认        | 描述                                                                           |
| :-------------------------- | :-------- | :--------------------------------------------------------------------------- |
| `confirm:yes`               | Y, Enter  | 确认操作                                                                         |
| `confirm:no`                | N, Escape | 拒绝操作                                                                         |
| `confirm:previous`          | Up        | 上一个选项                                                                        |
| `confirm:next`              | Down      | 下一个选项                                                                        |
| `confirm:nextField`         | Tab       | 下一个字段                                                                        |
| `confirm:previousField`     | （未绑定）     | 上一个字段                                                                        |
| `confirm:toggle`            | Space     | 切换选择                                                                         |
| `confirm:cycleMode`         | Shift+Tab | 循环权限模式                                                                       |
| `confirm:toggleExplanation` | Ctrl+E    | 在 Bash 和 PowerShell 权限提示上切换模型生成的[命令说明](/docs/zh-CN/permissions#permission-system) |

<h3 id="permission-actions">
  权限操作
</h3>

在 `Confirmation` 上下文中可用的权限对话框操作：

| 操作                       | 默认    | 描述                                                        |
| :----------------------- | :---- | :-------------------------------------------------------- |
| `permission:toggleDebug` | （未绑定） | 切换权限调试信息。之前的 Ctrl+D 默认值在 v2.1.146 中被移除，因为它与 `app:exit` 冲突 |

<h3 id="transcript-actions">
  记录操作
</h3>

在 `Transcript` 上下文中可用的操作：

| 操作                         | 默认                | 描述       |
| :------------------------- | :---------------- | :------- |
| `transcript:toggleShowAll` | Ctrl+E            | 切换显示所有内容 |
| `transcript:exit`          | q, Ctrl+C, Escape | 退出记录查看   |

<h3 id="history-search-actions">
  历史搜索操作
</h3>

在 `HistorySearch` 上下文中可用的操作：

| 操作                         | 默认          | 描述              |
| :------------------------- | :---------- | :-------------- |
| `historySearch:next`       | Ctrl+R      | 下一个匹配项          |
| `historySearch:accept`     | Escape, Tab | 接受选择            |
| `historySearch:cancel`     | Ctrl+C      | 取消搜索            |
| `historySearch:execute`    | Enter       | 执行选定的命令         |
| `historySearch:cycleScope` | Ctrl+S      | 循环范围：会话、项目、任何地方 |

<h3 id="task-actions">
  任务操作
</h3>

在 `Task` 上下文中可用的操作：

| 操作                | 默认                    | 描述                                                     |
| :---------------- | :-------------------- | :----------------------------------------------------- |
| `task:background` | Ctrl+B, Ctrl+X Ctrl+B | 后台当前任务。Ctrl+X Ctrl+B 组合键需要 v2.1.169 或更高版本，避免 tmux 前缀冲突 |

<h3 id="theme-actions">
  主题操作
</h3>

在 `ThemePicker` 上下文中可用的操作：

| 操作                               | 默认     | 描述     |
| :------------------------------- | :----- | :----- |
| `theme:toggleSyntaxHighlighting` | Ctrl+T | 切换语法高亮 |

<h3 id="help-actions">
  帮助操作
</h3>

在 `Help` 上下文中可用的操作：

| 操作             | 默认     | 描述     |
| :------------- | :----- | :----- |
| `help:dismiss` | Escape | 关闭帮助菜单 |

<h3 id="tabs-actions">
  Tabs 操作
</h3>

在 `Tabs` 上下文中可用的操作：

| 操作              | 默认              | 描述     |
| :-------------- | :-------------- | :----- |
| `tabs:next`     | Tab, Right      | 下一个选项卡 |
| `tabs:previous` | Shift+Tab, Left | 上一个选项卡 |

<h3 id="attachments-actions">
  附件操作
</h3>

在 `Attachments` 上下文中可用的操作：

| 操作                     | 默认                | 描述      |
| :--------------------- | :---------------- | :------ |
| `attachments:next`     | Right             | 下一个附件   |
| `attachments:previous` | Left              | 上一个附件   |
| `attachments:remove`   | Backspace, Delete | 删除选定的附件 |
| `attachments:exit`     | Down, Escape      | 退出附件导航  |

<h3 id="footer-actions">
  页脚操作
</h3>

在 `Footer` 上下文中可用的操作：

| 操作                      | 默认     | 描述                |
| :---------------------- | :----- | :---------------- |
| `footer:next`           | Right  | 下一个页脚项            |
| `footer:previous`       | Left   | 上一个页脚项            |
| `footer:up`             | Up     | 在页脚中向上导航（在顶部取消选择） |
| `footer:down`           | Down   | 在页脚中向下导航          |
| `footer:openSelected`   | Enter  | 打开选定的页脚项          |
| `footer:clearSelection` | Escape | 清除页脚选择            |

<h3 id="message-selector-actions">
  消息选择器操作
</h3>

在 `MessageSelector` 上下文中可用的操作：

| 操作                       | 默认                                        | 描述       |
| :----------------------- | :---------------------------------------- | :------- |
| `messageSelector:up`     | Up, K, Ctrl+P                             | 在列表中向上移动 |
| `messageSelector:down`   | Down, J, Ctrl+N                           | 在列表中向下移动 |
| `messageSelector:top`    | Ctrl+Up, Shift+Up, Meta+Up, Shift+K       | 跳到顶部     |
| `messageSelector:bottom` | Ctrl+Down, Shift+Down, Meta+Down, Shift+J | 跳到底部     |
| `messageSelector:select` | Enter                                     | 选择消息     |

<h3 id="diff-actions">
  Diff 操作
</h3>

在 `DiffDialog` 上下文中可用的操作：

| 操作                    | 默认      | 描述                                                                         |
| :-------------------- | :------ | :------------------------------------------------------------------------- |
| `diff:dismiss`        | Escape  | 关闭差异查看器；从详情视图返回到文件列表                                                       |
| `diff:previousSource` | Left    | 上一个差异源                                                                     |
| `diff:nextSource`     | Right   | 下一个差异源                                                                     |
| `diff:previousFile`   | Up, K   | 文件列表中的上一个文件；在详情视图中向上滚动一行                                                   |
| `diff:nextFile`       | Down, J | 文件列表中的下一个文件；在详情视图中向下滚动一行                                                   |
| `diff:viewDetails`    | Enter   | 查看差异详情                                                                     |
| `diff:back`           | （未绑定）   | 在差异查看器中返回。Escape 通过 `diff:dismiss` 执行返回操作。详情视图中之前的 Left 默认值在 v2.1.203 中被移除 |

差异详情视图还将寻呼机风格的快捷键绑定到标准[滚动操作](#scroll-actions)。这些绑定是 `DiffDialog` 上下文的一部分，仅在详情视图中应用；[滚动操作](#scroll-actions)下列出的 `Scroll` 上下文默认值保持不变。

| 操作                    | 默认             | 描述        |
| :-------------------- | :------------- | :-------- |
| `scroll:pageUp`       | PageUp         | 向上滚动视口的一半 |
| `scroll:pageDown`     | PageDown       | 向下滚动视口的一半 |
| `scroll:fullPageUp`   | Shift+Space, B | 向上滚动整个视口  |
| `scroll:fullPageDown` | Space          | 向下滚动整个视口  |
| `scroll:top`          | G, Home        | 跳到顶部      |
| `scroll:bottom`       | Shift+G, End   | 跳到底部      |

<h3 id="model-picker-actions">
  模型选择器操作
</h3>

在 `ModelPicker` 上下文中可用的操作：

| 操作                            | 默认    | 描述              |
| :---------------------------- | :---- | :-------------- |
| `modelPicker:decreaseEffort`  | Left  | 降低工作量级别         |
| `modelPicker:increaseEffort`  | Right | 提高工作量级别         |
| `modelPicker:thisSessionOnly` | s     | 仅将突出显示的模型应用于此会话 |

<h3 id="select-actions">
  选择操作
</h3>

在 `Select` 上下文中可用的操作：

| 操作                | 默认              | 描述    |
| :---------------- | :-------------- | :---- |
| `select:next`     | Down, J, Ctrl+N | 下一个选项 |
| `select:previous` | Up, K, Ctrl+P   | 上一个选项 |
| `select:accept`   | Enter           | 接受选择  |
| `select:cancel`   | Escape          | 取消选择  |

<h3 id="plugin-actions">
  Plugin 操作
</h3>

在 `Plugin` 上下文中可用的操作：

| 操作                | 默认    | 描述                            |
| :---------------- | :---- | :---------------------------- |
| `plugin:toggle`   | Space | 切换插件选择                        |
| `plugin:install`  | I     | 安装选定的插件                       |
| `plugin:favorite` | F     | 将选定的插件标记为收藏，使其在"已安装"选项卡顶部附近排序 |

<h3 id="settings-actions">
  设置操作
</h3>

在 `Settings` 上下文中可用的操作。`select:accept` 和 `confirm:no` 操作从[选择](#select-actions)和[确认](#confirmation-actions)上下文中重用，具有特定于设置的行为：更改会在您更改时立即应用于每个设置，因此 Escape 关闭面板并保存您的更改，而不是拒绝。

| 操作                | 默认           | 描述             |
| :---------------- | :----------- | :------------- |
| `settings:search` | /            | 进入搜索模式         |
| `settings:retry`  | R            | 重试加载使用数据（出错时）  |
| `select:accept`   | Enter, Space | 更改选定的设置或打开其子菜单 |
| `confirm:no`      | Escape       | 关闭面板。更改已保存     |

<h3 id="voice-actions">
  语音操作
</h3>

在启用[语音听写](/docs/zh-CN/voice-dictation)时，在 `Chat` 上下文中可用的操作：

| 操作                 | 默认    | 描述                       |
| :----------------- | :---- | :----------------------- |
| `voice:pushToTalk` | Space | 听写提示。根据 `/voice` 模式按住或点击 |

<h3 id="scroll-actions">
  滚动操作
</h3>

在启用[全屏渲染](/docs/zh-CN/fullscreen)时，在 `Scroll` 上下文中可用的操作：

| 操作                          | 默认                   | 描述                                                   |
| :-------------------------- | :------------------- | :--------------------------------------------------- |
| `scroll:lineUp`             | （未绑定）                | 向上滚动一行。鼠标滚轮滚动触发此操作                                   |
| `scroll:lineDown`           | （未绑定）                | 向下滚动一行。鼠标滚轮滚动触发此操作                                   |
| `scroll:pageUp`             | PageUp               | 向上滚动视口高度的一半                                          |
| `scroll:pageDown`           | PageDown             | 向下滚动视口高度的一半                                          |
| `scroll:top`                | Ctrl+Home            | 跳到对话的开始                                              |
| `scroll:bottom`             | Ctrl+End             | 跳到最新消息并重新启用自动跟随                                      |
| `scroll:halfPageUp`         | （未绑定）                | 向上滚动视口高度的一半。与 `scroll:pageUp` 相同的行为，为 vi 风格的重新绑定提供   |
| `scroll:halfPageDown`       | （未绑定）                | 向下滚动视口高度的一半。与 `scroll:pageDown` 相同的行为，为 vi 风格的重新绑定提供 |
| `scroll:fullPageUp`         | （未绑定）                | 向上滚动整个视口高度                                           |
| `scroll:fullPageDown`       | （未绑定）                | 向下滚动整个视口高度                                           |
| `selection:copy`            | Ctrl+Shift+C / Cmd+C | 将选定的文本复制到剪贴板                                         |
| `selection:clear`           | （未绑定）                | 清除活动的文本选择                                            |
| `selection:extendLeft`      | Shift+Left           | 将活动选择向左扩展一列                                          |
| `selection:extendRight`     | Shift+Right          | 将活动选择向右扩展一列                                          |
| `selection:extendUp`        | Shift+Up             | 将活动选择向上扩展一行。当选择到达顶部边缘时滚动视口                           |
| `selection:extendDown`      | Shift+Down           | 将活动选择向下扩展一行。当选择到达底部边缘时滚动视口                           |
| `selection:extendLineStart` | Shift+Home           | 将活动选择扩展到行的开始                                         |
| `selection:extendLineEnd`   | Shift+End            | 将活动选择扩展到行的结束                                         |

<h2 id="keystroke-syntax">
  按键语法
</h2>

<h3 id="modifiers">
  修饰符
</h3>

使用修饰符键和 `+` 分隔符：

* `ctrl` 或 `control` - Control 键
* `shift` - Shift 键
* `alt`、`opt`、`option` 或 `meta` - Windows 和 Linux 上的 Alt 键，macOS 上的 Option 键
* `cmd`、`command`、`super` 或 `win` - macOS 上的 Command 键，Windows 上的 Windows 键，Linux 上的 Super 键

`cmd` 组仅在报告 Super 修饰符的终端中被检测到，例如支持 Kitty 键盘协议或 xterm 的 `modifyOtherKeys` 模式的终端。大多数终端不会发送它，因此对于希望在任何地方都能工作的绑定，请使用 `ctrl` 或 `meta`。

例如：

```text theme={null}
ctrl+k          Ctrl + K
shift+tab       Shift + Tab
meta+p          macOS 上的 Option + P，其他地方的 Alt + P
ctrl+shift+c    多个修饰符
```

<h3 id="uppercase-letters">
  大写字母
</h3>

独立的大写字母意味着 Shift。例如，`K` 等同于 `shift+k`。这对于 vim 风格的绑定很有用，其中大写和小写键有不同的含义。

带有修饰符的大写字母（例如 `ctrl+K`）被视为风格上的，**不**意味着 Shift：`ctrl+K` 与 `ctrl+k` 相同。

<h3 id="chords">
  和弦
</h3>

和弦是由空格分隔的按键序列：

```text theme={null}
ctrl+k ctrl+s   按 Ctrl+K，释放，然后按 Ctrl+S
```

<h3 id="special-keys">
  特殊键
</h3>

* `escape` 或 `esc` - Escape 键
* `enter` 或 `return` - Enter 键
* `tab` - Tab 键
* `space` - 空格键
* `up`、`down`、`left`、`right` - 箭头键
* `backspace`、`delete` - 删除键

<h2 id="unbind-default-shortcuts">
  取消绑定默认快捷键
</h2>

将操作设置为 `null` 以取消绑定默认快捷键：

```json theme={null}
{
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+s": null
      }
    }
  ]
}
```

这也适用于和弦绑定。取消绑定共享前缀的每个和弦会释放该前缀以用作单键绑定。任何活跃上下文中的和弦都会保留其前缀，因此您必须在定义该和弦的上下文中取消绑定每个和弦。

默认的 `Ctrl+X` 系列跨越两个上下文：`Chat` 中的 `ctrl+x ctrl+k` 和 `ctrl+x ctrl+e`，以及 `Task` 中的 `ctrl+x ctrl+b`。要将 `ctrl+x` 本身回收为单键绑定，请取消绑定所有这些：

```json theme={null}
{
  "bindings": [
    {
      "context": "Task",
      "bindings": {
        "ctrl+x ctrl+b": null
      }
    },
    {
      "context": "Chat",
      "bindings": {
        "ctrl+x ctrl+k": null,
        "ctrl+x ctrl+e": null,
        "ctrl+x": "chat:newline"
      }
    }
  ]
}
```

如果您取消绑定前缀上的某些但不是全部和弦，按下前缀仍会进入和弦等待模式以处理剩余的绑定。

<h2 id="reserved-shortcuts">
  保留的快捷键
</h2>

这些快捷键无法重新绑定：

| 快捷键       | 原因                     |
| :-------- | :--------------------- |
| Ctrl+C    | 硬编码的中断/取消              |
| Ctrl+D    | 硬编码的退出                 |
| Ctrl+M    | 与终端中的 Enter 相同（都发送 CR） |
| Caps Lock | 不传递到终端应用程序             |

<h2 id="terminal-conflicts">
  终端冲突
</h2>

某些快捷键可能与终端多路复用器冲突：

| 快捷键    | 冲突                 |
| :----- | :----------------- |
| Ctrl+B | tmux 前缀（按两次发送）     |
| Ctrl+A | GNU screen 前缀      |
| Ctrl+Z | Unix 进程暂停（SIGTSTP） |

<h2 id="vim-mode-interaction">
  Vim 模式交互
</h2>

启用 vim 模式（通过 `/config` → 编辑器模式）时，快捷键和 vim 模式独立运行：

* **Vim 模式**在文本输入级别处理输入（光标移动、模式、动作）
* **快捷键**在组件级别处理操作（切换待办事项、提交等）
* vim 模式中的 Escape 键从 INSERT 切换到 NORMAL 模式；它不触发 `chat:cancel`
* 大多数 Ctrl+key 快捷键通过 vim 模式传递到快捷键系统
* Vim 键不能通过快捷键文件重新映射。要映射两键 INSERT 模式序列（如 `jj`）到 Escape，请使用 [`vimInsertModeRemaps`](/docs/zh-CN/interactive-mode#remap-insert-mode-key-sequences) 设置
* 在 vim NORMAL 模式中，`?` 显示帮助菜单（vim 行为）
* 在 vim NORMAL 模式中，`/` 打开历史搜索，与标准模式中的 Ctrl+R 相同

<h2 id="validation">
  验证
</h2>

Claude Code 验证您的快捷键并显示以下警告：

* 解析错误（无效的 JSON 或结构）
* 无效的上下文名称
* 保留快捷键冲突
* 终端多路复用器冲突
* 同一上下文中的重复绑定

Claude Code 在文件加载时报告警告，并将每个警告写入调试日志。使用 [`--debug`](/docs/zh-CN/cli-reference#cli-flags) 启动 Claude Code 以查看详细信息。
