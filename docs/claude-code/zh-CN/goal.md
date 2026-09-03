> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 让 Claude 朝着目标工作

> 使用 /goal 设置完成条件，Claude 会在多个回合中持续工作，直到条件满足。

<Note>
  `/goal` 需要 Claude Code v2.1.139 或更高版本。
</Note>

`/goal` 命令设置一个完成条件，Claude 会在没有你逐步提示的情况下持续朝着这个目标工作。每个回合后，一个小型快速模型会检查条件是否满足。如果不满足，Claude 会开始另一个回合，而不是将控制权返回给你。一旦条件满足，目标会自动清除。

对于具有可验证的最终状态的实质性工作，使用目标：

* 将模块迁移到新 API，直到每个调用站点都能编译并通过测试
* 实现设计文档，直到所有验收标准都满足
* 将大文件拆分为专注的模块，直到每个模块都在大小预算内
* 处理标记的问题积压，直到队列为空

<h2 id="compare-ways-to-keep-a-session-running">
  比较保持会话运行的方式
</h2>

三种方法可以在提示之间保持当前会话运行。根据应该启动下一个回合的内容进行选择：

| 方法                                                                     | 下一个回合何时开始 | 停止条件                 |
| :--------------------------------------------------------------------- | :-------- | :------------------- |
| `/goal`                                                                | 前一个回合完成时  | 模型确认条件已满足            |
| [`/loop`](/docs/zh-CN/scheduled-tasks#run-a-prompt-repeatedly-with-%2Floop) | 时间间隔过去时   | 你停止它，或 Claude 决定工作完成 |
| [Stop hook](/docs/zh-CN/hooks-guide#prompt-based-hooks)                     | 前一个回合完成时  | 你自己的脚本或提示决定          |

`/goal` 和 Stop hook 都在每个回合后触发。`/goal` 是一个会话范围的快捷方式：你输入一个条件，它仅在当前会话中活跃。Stop hook 存在于你的设置文件中，适用于其范围内的每个会话，可以运行脚本进行确定性检查或运行提示进行模型评估的检查。

[Auto mode](/docs/zh-CN/auto-mode-config) 本身在单个回合内批准工具调用，但不会启动新的回合。Claude 在判断工作完成时停止。`/goal` 添加了一个单独的评估器，在每个回合后检查你的条件，因此完成由一个新鲜的模型而不是执行工作的模型决定。这两者是互补的：auto mode 消除了每个工具的提示，`/goal` 消除了每个回合的提示。

<Tip>
  上述方法保持当前会话运行。你也可以安排独立于任何打开的会话运行的工作，例如夜间测试或早晨分类。有关云例程和桌面计划任务的选项，请参阅[调度选项](/docs/zh-CN/scheduled-tasks#compare-scheduling-options)。
</Tip>

<h2 id="use-/goal">
  使用 `/goal`
</h2>

每个会话可以有一个活跃的目标。同一命令根据参数设置、检查和清除它。

<h3 id="set-a-goal">
  设置目标
</h3>

运行 `/goal` 后跟你想要满足的条件。如果已经有一个活跃的目标，新目标会替换它。

```text theme={null}
/goal all tests in test/auth pass and the lint step is clean
```

设置目标会立即启动一个回合，条件本身作为指令。你不需要发送单独的提示。当目标活跃时，`◎ /goal active` 指示器显示目标已运行多长时间。

目标不会改变权限。在默认权限模式下，Claude 在进行工具调用前仍会询问，这些工具调用是你的设置不允许的，例如上面的测试命令。要让目标回合无人值守地运行，请将 `/goal` 与[自动模式](/docs/zh-CN/auto-mode-config)配对。

每个回合后，评估器返回一个简短的原因，解释条件是否满足。最近的原因出现在状态视图和记录中，所以你可以看到 Claude 接下来要朝着什么工作。

<Note>
  目标会一直运行，直到条件满足或你运行 `/goal clear`。运行不带参数的 `/goal` 可以查看到目前为止花费的回合和令牌。
</Note>

<h3 id="write-an-effective-condition">
  编写有效的条件
</h3>

[评估器](#how-evaluation-works)根据 Claude 在对话中呈现的内容来判断你的条件。它不会独立运行命令或读取文件，所以将条件写成 Claude 自己的输出可以演示的内容。"所有 `test/auth` 中的测试都通过"之所以有效，是因为 Claude 运行测试，结果出现在记录中供评估器读取。

在许多回合中保持的条件通常具有：

* **一个可测量的最终状态**：测试结果、构建退出代码、文件计数、空队列
* **一个陈述的检查**：Claude 应该如何证明它，例如"`npm test` 退出 0"或"`git status` 是干净的"
* **重要的约束**：在此过程中必须不改变的任何内容，例如"没有其他测试文件被修改"

条件最多可以是 4,000 个字符。

要限制目标运行的时间，在条件中包含一个回合或时间子句，例如 `or stop after 20 turns`。Claude 每个回合都会针对该子句报告进度，评估器从对话中判断它。

<h3 id="check-status">
  检查状态
</h3>

运行不带参数的 `/goal` 可以查看当前状态。

```text theme={null}
/goal
```

如果目标活跃，状态显示：

* 条件
* 已运行多长时间
* 已评估多少个回合
* 当前令牌支出
* 评估器最近的原因

如果没有活跃的目标，但在会话早期实现了一个目标，状态显示已实现的条件及其持续时间、回合计数和令牌支出。

<h3 id="clear-a-goal">
  清除目标
</h3>

运行 `/goal clear` 可以在条件满足之前移除活跃的目标。

```text theme={null}
/goal clear
```

`stop`、`off`、`reset`、`none` 和 `cancel` 被接受为 `clear` 的别名。运行 `/clear` 启动新对话也会移除任何活跃的目标。

<h3 id="resume-with-an-active-goal">
  使用活跃目标恢复
</h3>

当会话结束时仍然活跃的目标会在你使用 `--resume` 或 `--continue` 恢复该会话时恢复。条件会保留，但回合计数、计时器和令牌支出基线在恢复时都会重置。已经实现或清除的目标不会恢复。

<h3 id="run-non-interactively">
  非交互式运行
</h3>

`/goal` 在[非交互式模式](/docs/zh-CN/headless)、[桌面应用](/docs/zh-CN/desktop)中工作，并通过[远程控制](/docs/zh-CN/remote-control)工作。使用 `-p` 设置目标会在单个调用中运行循环至完成：

```bash theme={null}
claude -p "/goal CHANGELOG.md has an entry for every PR merged this week"
```

使用默认文本输出时，在条件满足之前不会打印任何内容，所以运行许多回合的目标可能看起来卡住了。添加 `--output-format stream-json --verbose` 以在循环运行时发出每条消息。

使用 Ctrl+C 中断进程以在条件满足之前停止非交互式目标。

<h2 id="how-evaluation-works">
  评估如何工作
</h2>

`/goal` 是会话范围的[基于提示的 Stop hook](/docs/zh-CN/hooks#prompt-based-hooks)的包装器。每次 Claude 完成一个回合时，条件和到目前为止的对话都会发送到你配置的[小型快速模型](/docs/zh-CN/model-config)，默认为 Haiku。模型返回一个是或否的决定和一个简短的原因。"否"告诉 Claude 继续工作，并包括原因作为下一个回合的指导。"是"清除目标并在记录中记录一个已实现的条目。

评估器在你的会话配置的任何提供商上运行。它不调用工具，所以它只能判断 Claude 已经在对话中呈现的内容。

<Note>
  评估令牌在为你的提供商配置的小型快速模型上计费，与主回合支出相比通常可以忽略不计。
</Note>

<h2 id="requirements">
  要求
</h2>

`/goal` 仅在你已接受信任对话框的工作区中运行，因为评估器是 hooks 系统的一部分。当在任何设置级别设置了 [`disableAllHooks`](/docs/zh-CN/hooks#disable-or-remove-hooks) 时，或当在托管设置中设置了 [`allowManagedHooksOnly`](/docs/zh-CN/settings#hook-configuration) 时，`/goal` 也不可用。在每种情况下，命令会告诉你原因，而不是默默地什么都不做。

<h2 id="see-also">
  另请参阅
</h2>

* [使用 `/loop` 重复运行提示](/docs/zh-CN/scheduled-tasks#run-a-prompt-repeatedly-with-%2Floop)：按时间间隔重新运行，而不是直到条件满足
* [基于提示的 hooks](/docs/zh-CN/hooks-guide#prompt-based-hooks)：当你需要自定义评估逻辑时编写你自己的 Stop hook
* [自动模式](/docs/zh-CN/auto-mode-config)：自动批准工具调用，以便每个目标回合无人值守运行
* [调度比较](/docs/zh-CN/scheduled-tasks#compare-scheduling-options)：独立于任何打开的会话按计划运行工作
