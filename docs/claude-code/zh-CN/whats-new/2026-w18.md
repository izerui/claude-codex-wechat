> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第 18 周 · 2026 年 4 月 27 日 – 5 月 1 日

> Claude Code 在 Windows 上无需 Git Bash 即可运行，claude auth login 在浏览器回调无法到达 localhost 时接受粘贴的 OAuth 代码，claude project purge 清理每个项目的本地状态，将 PR URL 粘贴到 /resume 中可找到创建该会话的会话。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-120">v2.1.120 → v2.1.126</a></span>
  <span>4 项功能 · 4 月 27 日 – 5 月 1 日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">无需浏览器回调即可登录</span>
    <span className="digest-feature-pill">v2.1.126</span>
  </div>

  <p className="digest-feature-lede"><code>claude auth login</code> 现在接受在浏览器回调无法到达 localhost 时直接粘贴到终端的 OAuth 代码。这涵盖了 WSL2、SSH 会话和容器，其中重定向到本地端口不起作用。同一版本还修复了在慢速或代理连接以及仅 IPv6 devcontainers 上的登录超时。</p>

  <p className="digest-feature-try">登录，然后粘贴浏览器中的代码：</p>

  ```bash theme={null}
  claude auth login
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/cli-reference#cli-commands">CLI 参考</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">claude project purge</span>
    <span className="digest-feature-pill">v2.1.124</span>
  </div>

  <p className="digest-feature-lede">删除项目的所有 Claude Code 状态：记录、任务、文件历史和项目的配置条目。支持 `--dry-run` 预览、`-y`/`--yes` 跳过确认、`-i`/`--interactive` 选择以及 `--all` 清除每个项目。</p>

  <p className="digest-feature-try">预览将删除的内容：</p>

  ```bash theme={null}
  claude project purge --dry-run
  ```

  <p className="digest-feature-try">然后真正运行它：</p>

  ```bash theme={null}
  claude project purge
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/cli-reference">CLI 参考</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">通过 PR URL 恢复</span>
    <span className="digest-feature-pill">v2.1.122</span>
  </div>

  <p className="digest-feature-lede">当你使用 <code>gh pr create</code> 创建拉取请求时，Claude Code 会将其链接到生成它的会话。现在你可以仅从 PR URL 返回到该会话，而无需记住其名称。</p>

  <p className="digest-feature-try">打开会话选择器：</p>

  ```text Claude Code theme={null}
  > /resume
  ```

  <p className="digest-feature-try">将 PR URL 粘贴到选择器中。粘贴的第一个字符将你置于搜索模式，列表筛选到创建该 PR 的会话。按 Enter 恢复它。GitHub、GitHub Enterprise、GitLab 和 Bitbucket 拉取和合并请求 URL 都可以使用。</p>

  ```text Claude Code theme={null}
  https://github.com/your-org/your-repo/pull/1234
  ```

  <p className="digest-feature-try">要跳过选择器，请改为在命令行上传递 PR 号：</p>

  ```bash theme={null}
  claude --from-pr 1234
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/sessions#use-the-session-picker">会话：使用会话选择器</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Windows 无需 Git Bash</span>
    <span className="digest-feature-pill">Windows</span>
  </div>

  <p className="digest-feature-lede">不再需要 Git for Windows。当 Bash 不存在时，Claude Code 使用 PowerShell 作为 shell 工具，当启用 PowerShell 工具时，它被视为主要 shell。现在自动检测通过 Microsoft Store、MSI 不带 PATH 或 <code>.NET</code> 全局工具安装的 PowerShell 7。</p>

  <a className="digest-feature-link" href="/docs/zh-CN/docs/setup">设置指南</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他优化</p>

  <div className="digest-wins-grid">
    <div>MCP 服务器可以通过其配置中的 <code>alwaysLoad: true</code> 选择退出工具搜索延迟，以便该服务器的所有工具始终可用</div>
    <div>新的 <code>claude plugin prune</code> 删除孤立的自动安装的插件依赖项，<code>plugin uninstall --prune</code> 级联删除</div>
    <div><code>/skills</code> 现在有一个类型过滤搜索框，因此你可以在长列表中找到技能而无需滚动</div>
    <div><code>PostToolUse</code> hooks 可以通过 <code>hookSpecificOutput.updatedToolOutput</code> 替换任何工具的工具输出，不仅仅是 MCP 工具</div>
    <div>新的 <a href="/docs/zh-CN/docs/ultrareview"><code>claude ultrareview</code></a> 子命令从 CI 或脚本非交互式地运行 <code>/ultrareview</code>：将发现打印到 stdout（<code>--json</code> 用于原始输出）并在完成时退出 0 或失败时退出 1</div>
    <div><code>--dangerously-skip-permissions</code> 现在绕过对 <code>.claude/</code>、<code>.git/</code>、<code>.vscode/</code>、shell 配置文件和其他以前受保护的路径的写入提示，而灾难性删除命令仍然作为安全网提示</div>
    <div><code>/model</code> 选择器可以在 <code>ANTHROPIC\_BASE\_URL</code> 指向 Anthropic 兼容网关时列出来自网关的 <code>/v1/models</code> 端点的模型；自 v2.1.129 起使用 <code>CLAUDE\_CODE\_ENABLE\_GATEWAY\_MODEL\_DISCOVERY=1</code> 选择加入</div>
    <div>在启动期间遇到瞬时错误的 MCP 服务器现在自动重试最多 3 次，而不是保持断开连接</div>
    <div><code>ANTHROPIC\_BEDROCK\_SERVICE\_TIER</code> 选择 Amazon Bedrock 服务层：<code>default</code>、<code>flex</code> 或 <code>priority</code></div>
    <div><code>/terminal-setup</code> 启用 iTerm2 的剪贴板访问设置，以便 <code>/copy</code> 工作，包括来自 tmux</div>
    <div>Google Cloud 的 Agent Platform 现在支持基于 X.509 证书的工作负载身份联合 (mTLS ADC)</div>
    <div>重大内存泄漏修复：图像繁重的会话、大型记录历史上的 <code>/usage</code> 以及没有进度事件的长时间运行工具</div>
  </div>
</div>

[v2.1.120–v2.1.126 的完整更新日志 →](/docs/en/changelog#2-1-120)
