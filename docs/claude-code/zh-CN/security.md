> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 安全性

> 了解 Claude Code 的安全防护措施和安全使用的最佳实践。

<h2 id="how-we-approach-security">
  我们如何处理安全性
</h2>

<h3 id="security-foundation">
  安全基础
</h3>

您的代码安全至关重要。Claude Code 以安全为核心构建，按照 Anthropic 的全面安全计划开发。在 [Anthropic Trust Center](https://trust.anthropic.com) 了解更多信息并访问资源（SOC 2 Type 2 报告、ISO 27001 证书等）。

<h3 id="permission-based-architecture">
  基于权限的架构
</h3>

Claude Code 默认使用严格的只读权限。当需要额外操作时（编辑文件、运行测试、执行命令），Claude Code 会请求明确的权限。用户可以控制是否批准一次性操作或自动允许操作。

Claude Code 在运行可以修改您的系统的 Bash 命令之前需要获得批准。一组内置的[只读命令](/docs/zh-CN/permissions#read-only-commands)，如 `ls`、`cat` 和 `git status`，无需提示即可运行。这种方法使用户和组织能够直接配置权限。

有关详细的权限配置，请参阅 [Permissions](/docs/zh-CN/permissions)。

<h3 id="built-in-protections">
  内置保护
</h3>

为了降低代理系统中的风险：

* **沙箱化 bash 工具**：使用文件系统和网络隔离的 [Sandbox](/docs/zh-CN/sandboxing) bash 命令，减少权限提示同时保持安全性。使用 `/sandbox` 启用以定义 Claude Code 可以自主工作的边界
* **工作目录边界**：Claude Code 只能写入启动它的文件夹及其子文件夹，不能在没有明确权限的情况下修改父目录中的文件。使用 Read、Grep 和 Glob 工具读取此边界外的路径在批准提示后是可能的。使用[额外目录](/docs/zh-CN/permissions#working-directories)扩展边界以跳过提示，或使用[沙箱 `denyRead` 规则](/docs/zh-CN/sandboxing#filesystem-isolation)限制对只读 Bash 命令可用的更广泛读取访问，这些规则仅在启用沙箱时适用
* **提示疲劳缓解**：支持按用户、按代码库或按组织的白名单常用安全命令
* **Accept Edits 模式**：自动批准文件编辑和一组固定的文件系统 Bash 命令，如 `mkdir`、`touch`、`rm`、`mv`、`cp` 和 `sed`，用于工作目录中的路径。其他 Bash 命令和超出范围的路径仍然会提示

<h3 id="user-responsibility">
  用户责任
</h3>

Claude Code 只拥有您授予它的权限。您负责在批准前审查建议的代码和命令的安全性。

<h2 id="protect-against-prompt-injection">
  防止提示注入
</h2>

提示注入是一种攻击者试图通过插入恶意文本来覆盖或操纵 AI 助手指令的技术。Claude Code 包括针对这些攻击的多项防护措施：

<h3 id="core-protections">
  核心保护
</h3>

* **权限系统**：敏感操作需要明确批准
* **上下文感知分析**：通过分析完整请求来检测潜在有害指令
* **输入清理**：通过处理用户输入来防止命令注入
* **网络命令批准**：从网络获取内容的命令，如 `curl` 和 `wget`，默认不会自动批准。它们会像任何其他非只读 Bash 命令一样提示，因此您仍然可以批准一次或添加显式允许规则，如 `Bash(curl *)`。要完全阻止它们，请将其添加到 [`permissions.deny`](/docs/zh-CN/permissions#tool-specific-permission-rules)

<h3 id="privacy-safeguards">
  隐私保护
</h3>

我们实施了多项保护措施来保护您的数据，包括：

* 敏感信息的有限保留期（请参阅 [Privacy Center](https://privacy.anthropic.com/en/articles/10023548-how-long-do-you-store-my-data) 了解更多）
* 对用户会话数据的受限访问
* 用户对数据训练偏好的控制。消费者用户可以随时更改其 [隐私设置](https://claude.ai/settings/privacy)。

有关完整详情，请查看我们的 [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms)（适用于 Team、Enterprise 和 API 用户）或 [Consumer Terms](https://www.anthropic.com/legal/consumer-terms)（适用于 Free、Pro 和 Max 用户）以及 [Privacy Policy](https://www.anthropic.com/legal/privacy)。

<h3 id="additional-safeguards">
  其他保护措施
</h3>

* **网络请求批准**：进行网络请求的工具默认需要用户批准
* **隔离的上下文窗口**：Web fetch 使用单独的上下文窗口以避免注入潜在恶意提示
* **信任验证**：首次代码库运行和新 MCP servers 需要信任验证
  * 注意：使用 `-p` 标志以非交互方式运行时，信任验证被禁用
  * 注意：当您直接在主目录中启动 Claude Code 时，信任接受仅在当前会话期间保持，不会写入磁盘，因此提示在每次启动时都会重新出现。没有设置可以持久化它。请从项目子目录启动 Claude Code，其中信任接受按目录保存
* **命令注入检测**：即使之前已白名单，可疑的 bash 命令也需要手动批准
* **故障关闭匹配**：不匹配的命令默认需要手动批准
* **自然语言描述**：复杂的 bash 命令包括用户理解的说明
* **安全凭证存储**：API 密钥和令牌存储在可用时的 macOS Keychain 中，在 Windows 和 Linux 上受文件权限保护。请参阅 [Credential Management](/docs/zh-CN/authentication#credential-management)

<Warning>
  **Windows WebDAV 安全风险**：在 Windows 上运行 Claude Code 时，我们建议不要启用 WebDAV 或允许 Claude Code 访问可能包含 WebDAV 子目录的路径，如 `\\*`。[WebDAV 已被 Microsoft 弃用](https://learn.microsoft.com/en-us/windows/whats-new/deprecated-features#:~:text=The%20Webclient%20\(WebDAV\)%20service%20is%20deprecated)，原因是安全风险。启用 WebDAV 可能允许 Claude Code 触发对远程主机的网络请求，绕过权限系统。
</Warning>

**处理不受信任内容的最佳实践**：

1. 在批准前审查建议的命令
2. 避免直接将不受信任的内容通过管道传递给 Claude
3. 验证对关键文件的建议更改
4. 使用虚拟机 (VM) 运行脚本并进行工具调用，特别是在与外部 Web 服务交互时
5. 使用 `/feedback` 报告可疑行为

<Warning>
  虽然这些保护措施大大降低了风险，但没有系统完全免疫所有攻击。在使用任何 AI 工具时，始终保持良好的安全实践。
</Warning>

<h2 id="mcp-security">
  MCP 安全性
</h2>

Claude Code 允许用户配置 Model Context Protocol (MCP) servers。允许的 MCP servers 列表在您的源代码中配置，作为 Claude Code 设置的一部分，工程师将其检入源代码控制。

我们鼓励编写您自己的 MCP servers 或使用来自您信任的提供商的 MCP servers。您能够为 MCP servers 配置 Claude Code 权限。Anthropic 在将连接器添加到 [Anthropic Directory](https://claude.ai/directory) 之前，会根据其 [列表标准](https://claude.com/docs/connectors/building/review-criteria) 审查连接器，但不对任何 MCP server 进行安全审计或管理。

<h2 id="ide-security">
  IDE 安全性
</h2>

有关在 IDE 中运行 Claude Code 的更多信息，请参阅 [VS Code security and privacy](/docs/zh-CN/vs-code#security-and-privacy)。

<h2 id="cloud-execution-security">
  云执行安全性
</h2>

使用 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web) 时，会实施额外的安全控制：

* **隔离的虚拟机**：每个云会话在隔离的、由 Anthropic 管理的 VM 中运行
* **网络访问控制**：网络访问默认受限，可以配置为禁用或仅允许特定域
* **凭证保护**：身份验证通过安全代理处理，该代理在沙箱内使用作用域凭证，然后转换为您的实际 GitHub 身份验证令牌
* **分支限制**：Git push 操作限制在当前工作分支
* **审计日志**：云环境中的所有操作都被记录以用于合规和审计目的
* **自动清理**：会话完成后，云环境会自动终止

有关云执行的更多详情，请参阅 [Claude Code on the web](/docs/zh-CN/claude-code-on-the-web)。

[Remote Control](/docs/zh-CN/remote-control) 会话的工作方式不同：Web 界面连接到在您本地机器上运行的 Claude Code 进程。所有代码执行和文件访问都保持本地，会话流量通过 TLS 上的 Anthropic API 传输；连接时，会话记录存储在 Anthropic 服务器上以跨设备同步对话，如 [Connection and security](/docs/zh-CN/remote-control#connection-and-security) 中所述。不涉及云 VM 或沙箱。连接使用多个短期的、范围狭窄的凭证，每个凭证限制于特定目的并独立过期，以限制任何单个受损凭证的影响范围。

<h2 id="security-best-practices">
  安全最佳实践
</h2>

<h3 id="working-with-sensitive-code">
  处理敏感代码
</h3>

* 在批准前审查所有建议的更改
* 为敏感存储库使用项目特定的权限设置
* 考虑使用 [dev containers](/docs/zh-CN/devcontainer) 以获得额外隔离
* 使用 `/permissions` 定期审计您的权限设置

<h3 id="team-security">
  团队安全
</h3>

* 使用 [managed settings](/docs/zh-CN/settings#settings-files) 来强制执行组织标准
* 通过版本控制共享批准的权限配置
* 培训团队成员了解安全最佳实践
* 通过 [OpenTelemetry metrics](/docs/zh-CN/monitoring-usage) 监控 Claude Code 使用情况
* 使用 [`ConfigChange` hooks](/docs/zh-CN/hooks#configchange) 审计或阻止会话期间的设置更改

<h3 id="reporting-security-issues">
  报告安全问题
</h3>

如果您在 Claude Code 中发现安全漏洞：

1. 不要公开披露
2. 通过我们的 [HackerOne program](https://hackerone.com/4f1f16ba-10d3-4d09-9ecc-c721aad90f24/embedded_submissions/new) 报告
3. 包括详细的复现步骤
4. 在公开披露前给我们时间来解决问题

<h2 id="related-resources">
  相关资源
</h2>

* [Security guidance plugin](/docs/zh-CN/security-guidance)：让 Claude 在会话期间审查和修复其自身代码更改中的漏洞
* [Sandbox environments](/docs/zh-CN/sandbox-environments)：比较隔离方法并为您的威胁模型选择一个
* [Sandboxing](/docs/zh-CN/sandboxing)：Bash 命令的文件系统和网络隔离
* [Permissions](/docs/zh-CN/permissions)：配置权限和访问控制
* [Monitoring usage](/docs/zh-CN/monitoring-usage)：跟踪和审计 Claude Code 活动
* [Development containers](/docs/zh-CN/devcontainer)：安全、隔离的环境
* [Anthropic Trust Center](https://trust.anthropic.com)：安全认证和合规
