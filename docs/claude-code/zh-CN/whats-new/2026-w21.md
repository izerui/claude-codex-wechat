> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第 21 周 · 2026 年 5 月 18–22 日

> 在 Pro 计划上使用自动模式并支持 Sonnet 4.6，在 /usage 中查看哪些 skills、subagents 和 MCP servers 驱动您的计划限制，并使用新的 /code-review 命令查看差异。

<div className="digest-meta">
  <span>Releases <a href="/docs/docs/en/changelog#2-1-143">v2.1.143 → v2.1.149</a></span>
  <span>1 feature · 5 月 18–22</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Pro 计划上的自动模式</span>
    <span className="digest-feature-pill">CLI</span>
  </div>

  <p className="digest-feature-lede">自动模式现已在 Pro 计划上可用，并支持 Sonnet 4.6 以及 Opus。它用后台安全检查替代权限提示：常规操作无需中断您即可运行，而破坏性或可疑操作会被阻止并显示。</p>

  <p className="digest-feature-try">更新 Claude Code，然后使用 Shift+Tab 切换模式；一旦您的账户满足要求，自动模式就会出现：</p>

  ```bash terminal theme={null}
  claude update
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/permission-modes#eliminate-prompts-with-auto-mode">自动模式</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他改进</p>

  <div className="digest-wins-grid">
    <div><a href="/docs/zh-CN/costs#track-your-costs"><code>/usage</code></a> 现在显示按类别细分的内容，说明是什么驱动您的计划限制，将最近的使用情况归因于 skills、subagents、plugins 和单个 MCP servers</div>
    <div>"Extra usage"在整个 CLI 中重命名为"usage credits"，<code>/extra-usage</code> 现在是 <code>/usage-credits</code>。旧名称仍然有效。</div>
    <div>新的 <a href="/docs/zh-CN/code-review"><code>/code-review</code></a> 命令在选定的工作量级别（如 <code>/code-review high</code>）报告正确性错误，<code>--comment</code> 将发现作为内联 GitHub PR 注释发布。<code>/simplify</code> 保留为单独的仅清理审查。</div>
    <div>后台会话现在与交互式会话一起出现在 <code>/resume</code> 中，标记为 <code>bg</code>，在 <code>claude agents</code> 中使用 <code>Ctrl+T</code> 固定的会话在空闲时保持活跃</div>
    <div><code>claude agents --json</code> 将实时会话列为 JSON 以供脚本编写，例如状态栏和会话选择器</div>
    <div>PowerShell 工具现在在 Windows 上默认为 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 用户启用；使用 <code>CLAUDE\_CODE\_USE\_POWERSHELL\_TOOL=0</code> 选择退出</div>
    <div><code>claude plugin disable</code> 现在在另一个启用的插件依赖于目标时拒绝，<code>claude plugin enable</code> 强制启用传递依赖</div>
    <div><code>/plugin</code> marketplace 浏览窗格显示预计的上下文成本，Discover 和 Browse 屏幕在安装前列出插件的命令、agents、skills、hooks 和 MCP/LSP servers</div>
    <div>新的 <code>worktree.bgIsolation: "none"</code> 设置允许后台会话直接编辑工作副本，无需 <code>EnterWorktree</code>，适用于 worktrees 不实用的存储库</div>
    <div>Markdown 输出呈现 GFM 任务列表复选框，<code>/diff</code> 详细视图使用键盘滚动</div>
    <div>状态行 JSON 输入现在在检测到时包括 GitHub 存储库和 PR 信息</div>
    <div>Enterprise：<code>allowAllClaudeAiMcps</code> 托管设置加载 claude.ai 云 MCP 连接器以及 <code>managed-mcp.json</code></div>
  </div>
</div>

[v2.1.143–v2.1.149 的完整更新日志 →](/docs/en/changelog#2-1-143)
