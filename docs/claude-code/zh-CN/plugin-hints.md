> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 从您的 CLI 推荐您的插件

> 从您的 CLI 发出一行标记，以便 Claude Code 提示用户安装您的官方插件。

如果您维护 CLI 或 SDK，并在官方 Anthropic 市场中拥有插件，您的工具可以提示 Claude Code 用户安装该插件。当您的 CLI 检测到它在 Claude Code 内运行时，会向 stderr 写入一行标记。Claude Code 读取该标记，将其从输出中删除，并向用户显示一次性安装提示。

Claude Code 在将命令输出发送给模型之前会从命令输出中删除提示行，因此标记永远不会出现在对话中，也不会计入令牌使用量。该协议不需要额外命令，也不会改变您的 CLI 为 Claude Code 外部用户打印的内容。

本页面适用于 CLI 和 SDK 维护者。如果您正在寻找安装插件，请参阅[发现和安装插件](/docs/zh-CN/discover-plugins)。

<h2 id="how-it-works">
  工作原理
</h2>

Claude Code 为通过 Bash 和 PowerShell 工具运行的每个命令以及 [hook](/docs/zh-CN/hooks) 命令设置 [`CLAUDECODE`](/docs/zh-CN/env-vars) 环境变量为 `1`。从 v2.1.172 开始，它还在这些相同的子进程中将 [`CLAUDE_CODE_CHILD_SESSION`](/docs/zh-CN/env-vars) 设置为 `1`。当您的 CLI 看到这些变量之一时，它会向 stderr 写入一个自闭合的 `<claude-code-hint />` 标签。在 hook 命令中，提示标签会被剥离并忽略。只有 Bash 和 PowerShell 工具输出会触发安装提示。

当 Claude Code 接收到命令输出时，它会：

1. 扫描提示行并在输出到达模型之前将其删除
2. 检查提示是否针对官方 Anthropic 市场中的插件
3. 检查插件是否尚未安装且之前未提示过
4. 向用户显示安装提示，其中包含发出提示的命令的名称

Claude Code 永远不会自动安装插件。用户始终需要确认。

<h2 id="emit-the-hint">
  发出提示
</h2>

提示提示仅对官方 Anthropic 市场中列出的插件触发。在发布集成之前，请参阅[将您的插件纳入官方市场](#get-your-plugin-into-the-official-marketplace)。

在环境变量上进行门控以发出提示，使标记不太可能在人类直接运行您的 CLI 时出现，然后将标签写入 stderr，单独占一行。选择要检查的变量：

* `CLAUDECODE`：在每个 Claude Code 版本上设置，因此可以到达最多的会话。它也在 tmux 会话和 Claude Code 启动的 stdio MCP 服务器子进程中设置，IDE 扩展在其集成终端中设置它，人类可能在那里直接运行您的 CLI。
* `CLAUDE_CODE_CHILD_SESSION`：仅在 Claude Code 本身生成的子进程中设置，例如工具调用、hook 命令和[状态行](/docs/zh-CN/statusline)命令，因此标签通常不会到达人类终端。在会话内启动的长期进程（例如 tmux 服务器）会捕获该变量，因此从该进程启动的后续 shell 仍然显示原始标签。需要 Claude Code v2.1.172 或更高版本，因此较旧版本上的会话会错过提示。

以下示例在 `CLAUDECODE` 上进行门控以获得最大覆盖范围，并为官方市场中名为 `example-cli` 的插件发出提示：

<CodeGroup>
  ```javascript Node.js theme={null}
  if (process.env.CLAUDECODE) {
    process.stderr.write(
      '<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />\n',
    )
  }
  ```

  ```python Python theme={null}
  import os, sys

  if os.environ.get("CLAUDECODE"):
      print(
          '<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />',
          file=sys.stderr,
      )
  ```

  ```go Go theme={null}
  if os.Getenv("CLAUDECODE") != "" {
      fmt.Fprintln(os.Stderr,
          `<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />`)
  }
  ```

  ```shell Shell theme={null}
  [ -n "$CLAUDECODE" ] &&
    printf '%s\n' '<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />' >&2
  ```
</CodeGroup>

将 `example-cli` 替换为您在官方市场中的插件名称。

<h2 id="choose-where-to-emit">
  选择发出位置
</h2>

您可以控制哪些代码路径发出提示。Claude Code 按插件进行去重，因此在每次调用时发出提示没有缺点。效果良好的接触点包括：

| 位置          | 为什么有效                      |
| :---------- | :------------------------- |
| `--help` 输出 | Claude 在探索不熟悉的 CLI 时经常运行帮助 |
| 未知子命令错误     | 到达 Claude 对您的界面感到困惑的时刻     |
| 登录或身份验证成功   | 用户已经处于设置心态                 |
| 首次运行欢迎消息    | 自然的入门时刻                    |

<h2 id="what-the-user-sees">
  用户看到的内容
</h2>

当提示通过所有检查时，Claude Code 会显示如下提示：

```text theme={null}
─────────────────────────────────────────────────────────────
  Plugin recommendation

    The example-cli command suggests installing a plugin.

    Plugin: example-cli
    Marketplace: claude-plugins-official
    Official integration for example-cli deployments

    Would you like to install it?
    ❯ 1. Yes, install example-cli
      2. No
      3. No, and don't show plugin installation hints again

─────────────────────────────────────────────────────────────
```

提示会显示生成提示的命令的名称，以便用户可以发现工具与其推荐的插件之间的不匹配。如果用户在 30 秒内没有响应，提示会作为**否**关闭。

提示频率受限：

* **每个插件一次**：显示提示后，Claude Code 会记录该插件，无论用户的答案如何，都不会再次提示该插件。
* **每个会话一次**：在机器上的所有 CLI 中，每个 Claude Code 会话最多出现一个提示。

选择**是**会将插件安装到用户范围。选择**否，不再显示插件安装提示**会禁用用户的所有未来提示。

<h2 id="hint-format">
  提示格式
</h2>

提示是一个具有三个必需属性的自闭合标签。

```text theme={null}
<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />
```

| 属性      | 必需 | 描述                          |
| :------ | :- | :-------------------------- |
| `v`     | 是  | 协议版本。`1` 是唯一支持的值            |
| `type`  | 是  | 提示类型。`plugin` 是唯一支持的值       |
| `value` | 是  | `name@marketplace` 形式的插件标识符 |

属性值可以用双引号引用或不引用。未引用的值不能包含空格。不支持转义序列。

<h2 id="requirements">
  要求
</h2>

Claude Code 在对提示进行操作之前强制执行两个条件。未通过任一检查的提示将被丢弃：

* **单独一行**：标签必须占据自己的一行。嵌入在行中间的标签，例如在日志语句内，会被忽略。允许行前后有空格。
* **官方市场**：`value` 必须引用 Anthropic 控制的市场中的插件，例如 `claude-plugins-official`。指向其他市场的提示会被静默丢弃。

提示行始终在到达模型之前从输出中删除，即使版本或类型无法识别，因此标记永远不会计入令牌使用量。

其余指导是推荐的但不强制的。Claude Code 无法观察您的 CLI 是否遵循它：

* **写入 stderr**：stderr 将标签保留在 shell 管道之外，例如 `example-cli deploy | jq`。Claude Code 扫描两个流，因此 stdout 也可以工作。
* **在环境变量上进行门控**：仅在设置 `CLAUDECODE` 或 `CLAUDE_CODE_CHILD_SESSION` 时发出。请参阅[发出提示](#emit-the-hint)了解这两个变量的区别。

<h2 id="get-your-plugin-into-the-official-marketplace">
  将您的插件放入官方市场
</h2>

提示协议仅对在官方 Anthropic 市场 `claude-plugins-official` 中列出的插件生效。Anthropic 自行决定策划该市场，应用内提交表单会将插件添加到[社区市场](/docs/zh-CN/plugins#submit-your-plugin-to-the-community-marketplace)，提示协议不检查该市场。如果您正在与 Anthropic 合作伙伴联系合作，请与他们联系以协调官方市场列表。

<h2 id="see-also">
  另请参阅
</h2>

* [创建插件](/docs/zh-CN/plugins)：构建您的 CLI 推荐的插件
* [创建和分发插件市场](/docs/zh-CN/plugin-marketplaces)：在官方市场外托管插件
* [环境变量](/docs/zh-CN/env-vars)：`CLAUDECODE` 和相关变量的完整参考
