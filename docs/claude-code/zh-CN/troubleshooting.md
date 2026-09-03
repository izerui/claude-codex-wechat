> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 故障排除

> 修复 Claude Code 中的高 CPU 或内存使用、挂起、自动压缩抖动和搜索问题，并找到其他问题的正确页面。

本页涵盖 Claude Code 运行后的性能、稳定性和搜索问题。对于其他问题，请从与您遇到的问题相匹配的页面开始：

| 症状                                                                                                                        | 转到                                                                        |
| :------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------ |
| `command not found`、安装失败、PATH 问题、`EACCES`、TLS 错误                                                                          | [故障排除安装和登录](/docs/zh-CN/troubleshoot-install)                                  |
| 更新或安装下载失败，显示 `The connection dropped while downloading the update` 或 `aborted`                                            | [错误参考](/docs/zh-CN/errors#the-connection-dropped-while-downloading-the-update) |
| 登录循环、OAuth 错误、`403 Forbidden`、"organization disabled"、Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 凭据 | [故障排除安装和登录](/docs/zh-CN/troubleshoot-install#login-and-authentication)         |
| 设置未应用、hooks 未触发、MCP 服务器未加载                                                                                                | [调试您的配置](/docs/zh-CN/debug-your-config)                                        |
| `API Error: 5xx`、`529 Overloaded`、`429`、请求验证错误                                                                            | [错误参考](/docs/zh-CN/errors)                                                     |
| `model not found` 或 `you may not have access to it`                                                                       | [错误参考](/docs/zh-CN/errors#theres-an-issue-with-the-selected-model)             |
| VS Code 扩展未连接或未检测到 Claude                                                                                                 | [VS Code 集成](/docs/zh-CN/vs-code#fix-common-issues)                            |
| JetBrains 插件或 IDE 未检测到                                                                                                    | [JetBrains 集成](/docs/zh-CN/jetbrains#troubleshooting)                          |
| 高 CPU 或内存、响应缓慢、挂起、搜索找不到文件                                                                                                 | [性能和稳定性](#performance-and-stability)下方                                    |

如果您不确定哪个适用，请在 Claude Code 内运行 `/doctor` 以自动检查您的安装、设置、扩展和上下文使用情况；它会提议可以在您确认后应用的修复。如果 `claude` 根本无法启动，请从您的 shell 运行 `claude doctor`。运行 `/mcp` 以检查 MCP 服务器状态。

<h2 id="performance-and-stability">
  性能和稳定性
</h2>

这些部分涵盖与资源使用、响应性和搜索行为相关的问题。

<h3 id="high-cpu-or-memory-usage">
  高 CPU 或内存使用
</h3>

Claude Code 设计用于大多数开发环境，但在处理大型代码库时可能消耗大量资源。如果您遇到性能问题：

1. 定期使用 `/compact` 以减少上下文大小
2. 在主要任务之间关闭并重启 Claude Code
3. 考虑将大型构建目录添加到您的 `.gitignore` 文件
4. 使用 [`claude --safe-mode`](/docs/zh-CN/cli-reference#cli-flags) 重启以检查插件、MCP 服务器或 hook 是否是源头。它禁用会话的所有自定义；如果使用量下降，请参阅[调试您的配置](/docs/zh-CN/debug-your-config#test-against-a-clean-configuration)以找出是哪一个

如果内存使用在这些步骤后仍然很高，请运行 `/heapdump` 以将 JavaScript 堆快照和内存分解写入 `~/Desktop`。在 Linux 上没有 Desktop 文件夹的情况下，文件被写入您的主目录。

分解显示驻留集大小、JS 堆、数组缓冲区和未计算的本机内存，这有助于识别增长是在 JavaScript 对象中还是在本机代码中。要检查保留者，请在 Chrome DevTools 中的 Memory → Load 下打开 `.heapsnapshot` 文件；分解是以 `-diagnostics.json` 结尾的文件。

<Warning>
  `.heapsnapshot` 文件包含进程中的每个字符串。不要将其附加到公开问题或共享。在 [GitHub](https://github.com/anthropics/claude-code/issues) 上报告内存问题时，仅附加 `-diagnostics.json` 文件。该文件包含内存统计信息，不包含任何对话内容或凭证。
</Warning>

<h3 id="large-tables-are-cut-off-in-the-terminal">
  大型表格在终端中被截断
</h3>

超过 200 行的 Markdown 表格呈现其前 200 行，后跟 `… N more rows not shown` 行。仅显示被限制：完整表格保留在对话中，[`/copy`](/docs/zh-CN/commands) 复制每一行。对于在终端中太大而无法读取的表格，请要求 Claude 将其写入文件。在 v2.1.208 之前，Claude Code 呈现每一行，因此恢复包含非常大表格的会话可能会在重新呈现时停滞。

<h3 id="auto-compaction-stops-with-a-thrashing-error">
  自动压缩停止并出现抖动错误
</h3>

如果您看到 `Autocompact is thrashing: the context refilled to the limit...`，自动压缩成功，但文件或工具输出立即多次将上下文窗口重新填充到限制。Claude Code 停止重试以避免在没有取得进展的循环上浪费 API 调用。

要恢复：

1. 要求 Claude 以较小的块读取超大文件，例如特定行范围或函数，而不是整个文件
2. 运行 `/compact`，重点是删除大输出，例如 `/compact keep only the plan and the diff`
3. 将大文件工作移到 [subagent](/docs/zh-CN/sub-agents)，以便它在单独的上下文窗口中运行
4. 如果早期对话不再需要，运行 `/clear`

<h3 id="command-hangs-or-freezes">
  命令挂起或冻结
</h3>

如果 Claude Code 似乎无响应：

1. 按 Ctrl+C 尝试取消当前操作
2. 如果无响应，您可能需要关闭终端并重新启动

重新启动不会丢失您的对话。在同一目录中运行 `claude --resume` 以继续会话。

<h3 id="garbled-or-corrupted-text-in-an-editor’s-integrated-terminal">
  编辑器集成终端中的文本乱码或损坏
</h3>

如果在 VS Code、Cursor 或 Devin Desktop 集成终端中运行 Claude Code 时字符呈现为方框、涂抹或错误的字形，终端的 GPU 渲染器可能是原因。在 Claude Code 中运行 `/terminal-setup` 以将 `terminal.integrated.gpuAcceleration` 设置为 `"off"`，或在编辑器设置中手动设置并重新加载窗口。有关 `/terminal-setup` 写入的其他设置，请参阅[终端配置](/docs/zh-CN/terminal-config)。

<h3 id="search-and-discovery-issues">
  搜索和发现问题
</h3>

如果搜索工具、`@file` 提及、自定义代理或自定义 skills 找不到文件，捆绑的 `ripgrep` 二进制文件可能无法在您的系统上运行。安装您平台的 `ripgrep` 包并告诉 Claude Code 改用它：

<Tabs>
  <Tab title="macOS">
    ```bash theme={null}
    brew install ripgrep
    ```
  </Tab>

  <Tab title="Ubuntu/Debian">
    ```bash theme={null}
    sudo apt install ripgrep
    ```
  </Tab>

  <Tab title="Alpine">
    ```bash theme={null}
    apk add ripgrep
    ```
  </Tab>

  <Tab title="Arch">
    ```bash theme={null}
    pacman -S ripgrep
    ```
  </Tab>

  <Tab title="Windows">
    ```powershell theme={null}
    winget install BurntSushi.ripgrep.MSVC
    ```
  </Tab>
</Tabs>

然后在您的[环境](/docs/zh-CN/env-vars)中设置 `USE_BUILTIN_RIPGREP=0`。

<h3 id="slow-or-incomplete-search-results-on-wsl">
  WSL 上的搜索速度缓慢或结果不完整
</h3>

在 WSL 上[跨文件系统工作](https://learn.microsoft.com/en-us/windows/wsl/filesystems)时的磁盘读取性能损失可能导致使用 Claude Code 在 WSL 上时搜索匹配数少于预期。搜索仍然有效，但返回的结果少于本机文件系统。

<Note>
  `claude doctor` 在这种情况下将搜索显示为正常。
</Note>

**解决方案：**

1. **提交更具体的搜索**：通过指定目录或文件类型来减少搜索的文件数："在 auth-service 包中搜索 JWT 验证逻辑"或"在 JS 文件中查找 md5 哈希的使用"。

2. **将项目移到 Linux 文件系统**：如果可能，确保您的项目位于 Linux 文件系统（`/home/`）而不是 Windows 文件系统（`/mnt/c/`）。

3. **改用本机 Windows**：考虑在 Windows 上本机运行 Claude Code 而不是通过 WSL，以获得更好的文件系统性能。

<h2 id="get-more-help">
  获取更多帮助
</h2>

如果您遇到此处未涵盖的问题：

1. 运行 `/doctor` 进行设置检查，运行 `/mcp` 检查 MCP 服务器状态
2. 在 Claude Code 中使用 `/feedback` 命令直接向 Anthropic 报告问题
3. 检查 [GitHub 存储库](https://github.com/anthropics/claude-code) 以了解已知问题
4. 直接向 Claude 询问其功能和特性。Claude 可以内置访问其文档。
