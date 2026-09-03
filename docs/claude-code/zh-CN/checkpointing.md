> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Checkpointing

> 跟踪、回溯和总结 Claude 的编辑和对话以管理会话状态。

Claude Code 自动跟踪 Claude 在工作时所做的文件编辑，允许您快速撤销更改并回溯到之前的状态，以防任何事情出现偏差。

<h2 id="how-checkpoints-work">
  checkpointing 如何工作
</h2>

当您与 Claude 合作时，checkpointing 会自动捕获每次用户提示前代码的状态。这个安全网让您可以放心地执行雄心勃勃的大规模任务，因为您始终可以返回到之前的代码状态。

<h3 id="automatic-tracking">
  自动跟踪
</h3>

Claude Code 跟踪其文件编辑工具所做的所有更改：

* 每个用户提示都会创建一个新的 checkpoint
* Claude Code 在一个会话中保留最近 100 个 checkpoint 的文件快照。丢弃较旧的 checkpoint 会删除没有其他 checkpoint 引用的快照文件，除了每个文件的第一个快照，VS Code 扩展将其用作会话 diffs 的基线。在 v2.1.208 之前，这些被取代的快照文件会保留在磁盘上，直到会话被清理。
* Checkpoints 与对话一起保存，因此恢复的会话仍然可以 `/rewind` 到它们
* 在 30 天后自动清理（可配置）

<h3 id="rewind-and-summarize">
  回溯和总结
</h3>

运行 `/rewind`，或在提示输入为空时按两次 `Esc`，打开回溯菜单。

<Note>
  如果提示输入包含文本，双 `Esc` 会清除它而不是打开菜单。清除的文本会保存到您的输入历史记录中，因此在您完成回溯菜单后，按 `Up` 可以调用它。
</Note>

回溯菜单列出了您在会话期间发送的每个提示。选择您想要操作的点，然后选择一个操作：

* **恢复代码和对话**：将代码和对话都恢复到该点
* **恢复对话**：回溯到该消息，同时保持当前代码
* **恢复代码**：恢复文件更改，同时保持对话
* **从此处总结**：将此点之后的对话压缩为摘要，释放 context window 空间
* **到此处总结**：将此点之前的对话压缩为摘要，保持后续消息完整
* **算了**：返回消息列表而不做任何更改

恢复对话或选择"从此处总结"后，所选消息的原始提示会恢复到输入字段中，以便您可以重新发送或编辑它。

选择"到此处总结"会让您留在对话末尾，输入字段为空。

<h4 id="rewind-past-a-cleared-conversation">
  回溯过去已清除的对话
</h4>

如果您在同一 Claude Code 进程中较早运行了 `/clear`，回溯菜单会在列表顶部显示一个额外的条目，标记为 `/resume <session-id> (previous session)`。选择它可以恢复在 `/clear` 运行前活跃的对话。该条目在您退出 Claude Code 或恢复不同会话之前可用，并且需要 Claude Code v2.1.191 或更高版本。在较早的版本上，运行 `/resume` 并从列表中选择上一个会话。

<h4 id="restore-vs-summarize">
  恢复与总结
</h4>

恢复选项恢复状态：它们撤销代码更改、对话历史或两者。总结选项将对话的一部分压缩为 AI 生成的摘要，而不改变磁盘上的文件：

* **从此处总结**：所选消息之前的消息保持不变。所选消息及其后的所有消息被替换为摘要。使用此选项可以放弃旁支讨论，同时保持早期上下文的完整细节。
* **到此处总结**：所选消息之前的消息被替换为摘要。所选消息及其后的所有消息保持不变，您留在对话的末尾。使用此选项可以压缩早期设置讨论，同时保持最近工作的完整细节。

在这两种情况下，原始消息都保存在会话记录中，因此 Claude 可以在需要时参考详细信息。您可以输入可选说明来指导摘要的重点。这类似于 `/compact`，但更有针对性：您不是总结整个对话，而是选择所选消息的哪一侧进行压缩。

<Note>
  总结将您保持在同一会话中并压缩上下文。如果您想尝试不同的方法，同时保持原始会话完整，请改用 [fork](/docs/zh-CN/sessions#branch-a-session)（`claude --continue --fork-session`）。
</Note>

<h2 id="common-use-cases">
  常见用例
</h2>

Checkpoints 在以下情况下特别有用：

* **探索替代方案**：尝试不同的实现方法，而不会丢失起点
* **从错误中恢复**：快速撤销引入错误或破坏功能的更改
* **迭代功能**：进行变体实验，知道您可以恢复到工作状态
* **释放上下文空间**：从中点开始总结冗长的调试会话，保持初始说明完整

<h2 id="limitations">
  限制
</h2>

<h3 id="bash-command-changes-not-tracked">
  Bash 命令更改未跟踪
</h3>

Checkpointing 不跟踪由 bash 命令修改的文件。例如，如果 Claude Code 运行：

```bash theme={null}
rm file.txt
mv old.txt new.txt
cp source.txt dest.txt
```

这些文件修改无法通过回溯撤销。只有通过 Claude 的文件编辑工具进行的直接文件编辑才会被跟踪。

<h3 id="external-changes-not-tracked">
  外部更改未跟踪
</h3>

Checkpointing 仅跟踪在当前会话中编辑过的文件。您在 Claude Code 外部对文件所做的手动更改以及来自其他并发会话的编辑通常不会被捕获，除非它们碰巧修改了与当前会话相同的文件。

<h3 id="not-a-replacement-for-version-control">
  不是版本控制的替代品
</h3>

Checkpoints 设计用于快速的会话级恢复。对于永久版本历史和协作：

* 继续使用版本控制（例如 Git）进行提交、分支和长期历史
* Checkpoints 补充但不替代适当的版本控制
* 将 checkpoints 视为"本地撤销"，将 Git 视为"永久历史"

<h2 id="see-also">
  另请参阅
</h2>

* [Interactive mode](/docs/zh-CN/interactive-mode) - 快捷键和会话控制
* [Commands](/docs/zh-CN/commands) - 使用 `/rewind` 访问 checkpoints
* [CLI reference](/docs/zh-CN/cli-reference) - 命令行选项
