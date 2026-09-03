> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 在企业启动器后面运行 Claude Code

> 通过 CLAUDE_CODE_PROCESS_WRAPPER 使用必需的启动器路由 Claude Code 从其自身二进制文件启动的进程，包括后台服务和每个代理视图会话。

某些组织要求工作站上的每个进程都通过强制启动器启动。启动器应用沙箱、网络控制或凭证注入，这些是公司安全态势所依赖的，而不通过它启动的二进制文件是策略违规。

`CLAUDE_CODE_PROCESS_WRAPPER` 通过您的启动器启动 Claude Code 从其自身二进制文件启动的每个进程：后台服务、它在 [agent view](/docs/zh-CN/agent-view) 中托管的每个会话，以及 Claude Code 在更新后的重新启动。将其设置为启动器的绝对路径，Claude Code 将使用 Claude Code 命令作为其参数运行启动器。

在您的 `PATH` 上包装 `claude` 命令的启动器无法到达这些进程，因为它们从二进制文件的直接路径启动，不查询 `claude`。

<Note>
  `CLAUDE_CODE_PROCESS_WRAPPER` 需要 Claude Code v2.1.208 或更高版本。早期版本忽略该变量并启动每个未包装的进程。
</Note>

<h2 id="what-the-launcher-covers">
  启动器覆盖的内容
</h2>

设置 `CLAUDE_CODE_PROCESS_WRAPPER` 后，Claude Code 通过您的启动器启动以下每个进程：

* `claude agents` 和后台会话按需启动的后台服务。
* 每个代理视图行内的终端主机和 Claude Code 会话，包括服务保持就绪的热备用会话。
* 服务在更新或崩溃后重新生成的会话。
* Claude Code 执行的自身重新启动以完成更新安装，包括代理视图的重启以更新操作。

在 Windows 上，该变量被忽略：启动器契约取决于 `exec`，Windows 不支持。设置了该变量的 Windows 机器运行每个未包装的进程并继续工作，唯一的信号是 [debug log](/docs/zh-CN/troubleshooting) 中的警告。如果您的启动器策略涵盖 Windows，该变量在那里不满足它：在规划推出时将 Windows 机器计为未包装。

<h3 id="processes-that-start-outside-the-launcher">
  在启动器外启动的进程
</h3>

三个进程永远不会通过启动器启动：

* [已安装的后台服务](/docs/zh-CN/agent-view#the-supervisor-process)：`launchd` 或 `systemd` 从其单元文件启动该进程。当这适用时，`/status` 和 `claude daemon status` 会发出警告，一旦服务使用设置中的变量重新启动，服务生成的会话仍会通过启动器启动。
* 您自己在终端中启动的会话，它运行的方式取决于您如何调用它。要覆盖这些会话，在 `PATH` 上较早的目录中放置一个名为 `claude` 的脚本，该脚本使用真实二进制文件运行您的启动器；不要替换托管符号链接。自生成不查询 `PATH`，所以两个启动器永远不会堆叠。
* `claude-cli://` 深层链接的第一个进程，操作系统的协议处理程序直接启动。该会话之后在后台启动的所有内容都通过启动器运行。要完全关闭此路径，请使用 `disableDeepLinkRegistration` 设置 [prevent handler registration](/docs/zh-CN/deep-links#registration-and-supported-platforms)。

<h3 id="helper-process-names-in-process-monitors">
  进程监视器中的辅助进程名称
</h3>

配置了启动器后，`ps` 和 Activity Monitor 显示后台辅助进程的版本化二进制名称，而不是 Claude Code 的 `claude bg-pty-host` 和 `claude bg-spare` 标签，因为启动器的 `exec` 重建了参数列表。重命名是副作用，不是隐瞒：进程在其他方面保持不变，Claude Code 通过二进制路径识别自己的进程，从不通过显示名称。

<h2 id="set-up-the-launcher">
  设置启动器
</h2>

<Steps>
  <Step title="编写启动器脚本">
    在绝对路径（例如 `/opt/corp/launcher`）创建可执行脚本。Claude Code 使用完整的 Claude Code 命令作为其参数运行它，脚本必须以调用 `exec "$@"` 结尾，以便它用 Claude Code 替换自己：

    ```bash theme={null}
    #!/bin/sh
    # 您组织的设置：进入沙箱、应用
    # 网络控制或注入凭证。
    exec "$@"
    ```

    使用 `chmod +x` 使其可执行。设置部分是启动器在 Claude Code 运行前必须做的任何事情；下面的 [the launcher contract](#the-launcher-contract) 列出脚本必须遵循的规则。

    <Note>
      如果您之前用启动器替换了 `~/.local/bin/claude` 符号链接，请在同一更改中恢复原始符号链接。替换的符号链接会导致第一个包装的会话同时通过两个启动器启动后台服务，并将安装置于外部管理状态：`/doctor` 报告它，自动更新保留文件，旧版本的清理保持禁用，直到安装程序再次管理该路径。
    </Note>
  </Step>

  <Step title="在设置中设置 CLAUDE_CODE_PROCESS_WRAPPER">
    在设置文件的 `env` 块中设置变量，以便分离的后台服务继承它。shell `export` 不够：后台服务按需启动，超过您的 shell 生命周期，并且从不重新读取 shell 配置文件。

    对于一台机器，将其添加到 `~/.claude/settings.json`。要将其部署到组织中的每台机器，请在 [managed settings](/docs/zh-CN/permissions#managed-settings) 中放置相同的块：

    ```json theme={null}
    {
      "env": {
        "CLAUDE_CODE_PROCESS_WRAPPER": "/opt/corp/launcher"
      }
    }
    ```

    当多个源设置变量时，托管设置值覆盖 `~/.claude/settings.json` 和 shell 中导出的值，因此用户无法将自生成指向不同的启动器。

    项目和本地设置无法设置此变量。提交到存储库的文件不能在机器上的每个 Claude Code 进程前放置二进制文件，因此 `.claude/settings.json` 或 `.claude/settings.local.json` 中的 `CLAUDE_CODE_PROCESS_WRAPPER` 被忽略，并在 [debug log](/docs/zh-CN/troubleshooting) 中发出警告。
  </Step>

  <Step title="重新启动后台服务和您的会话">
    运行的后台服务和任何打开的 `claude` 会话在启动时读取变量一次，因此它们继续启动未包装的进程，直到重新启动。运行 `claude daemon stop --any` 停止按需服务；下一个需要它的命令（例如 `claude agents`）启动一个包装的。[installed service](/docs/zh-CN/agent-view#the-supervisor-process) 采用 `claude daemon stop` 不带 `--any`。然后重新启动您打开的 `claude` 会话。

    在您无法手动重新启动的机器上，设置推送后启动的第一个会话自动停用剩余的未包装按需服务。没有新会话启动的机器保持其未包装的服务，直到启动一个，已安装的服务始终需要此步骤中的重新启动。
  </Step>

  <Step title="验证">
    在会话中运行 `/status`：Self-exec 条目显示已解析的启动命令，并在运行的后台服务与其不匹配时发出警告。`claude daemon status` 从 shell 打印相同的信息，包括在您取消设置变量后，当 `/status` 不再显示条目时。
  </Step>
</Steps>

<h2 id="the-launcher-contract">
  启动器契约
</h2>

当启动器无法运行时，Claude Code 拒绝启动进程，而不是启动它未包装。在 Windows 上，[the variable is ignored](#what-the-launcher-covers) 并且进程启动未包装。Claude Code 对脚本持有这些规则：

* **以 `exec "$@"` 结尾。** 启动器分叉子进程并退出会留下孤立的 Claude Code 进程，后台服务无法跟踪。代理视图用命名启动器的消息标记此类会话失败，服务收割启动器留下的内容。
* **不要重新排序、吸收或前置参数。** 第一个参数是 Claude Code 二进制文件，其后的所有内容都是其 argv。
* **将每个继承的环境变量传递给 `exec`。** 添加变量（例如注入的凭证）很好；删除继承的变量不是。
  * 每个会话的身份验证令牌、模型和提供程序选择以及 `CLAUDE_CODE_PROCESS_WRAPPER` 本身都在继承的环境中传输，因此从允许列表重建它的启动器会破坏它启动的会话，`/status` 报告启动器不匹配。
  * 如果启动器必须进入重置环境的命名空间或沙箱，请在其内部逐字重新导出继承的环境。
* **在大约三秒内到达 `exec`，每次启动器运行。** 冷后台调度在第一个输出字节之前连续运行启动器两次，因此请懒惰地或从缓存中执行单点登录交换等缓慢工作。
  * 运行远超预算的启动器被视为停滞启动并重新启动。
* **容忍从内部调用自己。** Claude Code 将启动器应用于每个嵌套的自生成，因此获取独占资源的启动器必须检测它是否已持有它。
* **不要在 Claude Code 启动前写入终端。** 在 `exec` 前打印的任何内容都会在会话在初始化前死亡时报告为崩溃原因。

<h3 id="format-of-the-claude_code_process_wrapper-value">
  `CLAUDE_CODE_PROCESS_WRAPPER` 值的格式
</h3>

对于大多数启动器，该值只是脚本的绝对路径，例如 `/opt/corp/launcher`。

要传递启动器自己的参数，请在路径后写入它们。Claude Code 将值解析为参数列表，而不是 shell 命令：

* 空格分隔令牌，双引号将包含空格的令牌分组。
* 以 `[` 开头的值被读取为 JSON 字符串数组，例如 `["/opt/corp/launcher", "--profile", "cc"]`。
* Shell 语法不起作用：没有变量扩展或通配符，未引用的运算符（例如 `;`、`|`、`&` 或 `$(`）被拒绝为配置错误，而不是重新解释。

当无法使用该值时，Claude Code 拒绝启动受影响的进程并 [reports the reason](/docs/zh-CN/errors#claude_code_process_wrapper-launcher-errors)。

<h2 id="relationship-to-claude_code_shell_prefix">
  与 `CLAUDE_CODE_SHELL_PREFIX` 的关系
</h2>

`CLAUDE_CODE_PROCESS_WRAPPER` 包装 Claude Code 自己的进程，并将命令作为单独的 argv 令牌传递给启动器以 `exec`。[`CLAUDE_CODE_SHELL_PREFIX`](/docs/zh-CN/env-vars) 包装 Claude 代表您运行的 shell 命令，例如 Bash 工具调用、hooks 和启动 stdio MCP 服务器的命令，并将每个作为单个 shell 引用的字符串在 `$1` 中传递给包装器以重新评估。为一个编写的启动器不能作为另一个工作。

<h2 id="related-resources">
  相关资源
</h2>

* [Agent view](/docs/zh-CN/agent-view)：启动器覆盖的后台会话和监督进程
* [Environment variables](/docs/zh-CN/env-vars)：`CLAUDE_CODE_PROCESS_WRAPPER` 参考条目
* [Managed settings](/docs/zh-CN/permissions#managed-settings)：在整个车队中传递 `env` 块
* [Launcher error reference](/docs/zh-CN/errors#claude_code_process_wrapper-launcher-errors)：拒绝消息和如何恢复
