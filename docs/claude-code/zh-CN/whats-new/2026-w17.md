> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第17周 · 2026年4月20–24日

> /ultrareview 作为研究预览版开放，返回终端时自动生成会话摘要，可以在插件中构建和发布自定义颜色主题，以及重新设计的网页版 Claude Code。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-114">v2.1.114 → v2.1.119</a></span>
  <span>4 项功能 · 4月20–24日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">/ultrareview</span>
    <span className="digest-feature-pill">research preview</span>
  </div>

  <p className="digest-feature-lede">现已公开研究预览版。Ultrareview 在云中针对您的分支或 PR 运行一队 bug 搜寻代理，发现的问题会自动返回到 CLI 或桌面应用。在合并关键更改（如身份验证或数据迁移）之前运行它。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/FTi4SBJ9YRs7d-5X/images/whats-new/ultrareview.mp4?fit=max&auto=format&n=FTi4SBJ9YRs7d-5X&q=85&s=0fb1271365d38f414ad155aeb8edb08e" data-path="images/whats-new/ultrareview.mp4" />
  </Frame>

  <p className="digest-feature-try">审查您当前所在的分支：</p>

  ```text Claude Code theme={null}
  > /ultrareview
  ```

  <p className="digest-feature-try">或将其指向 PR：</p>

  ```text Claude Code theme={null}
  > /ultrareview 1234
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/ultrareview">Ultrareview 指南</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">会话摘要</span>
    <span className="digest-feature-pill">CLI</span>
  </div>

  <p className="digest-feature-lede">将焦点从会话转移开，然后返回时会看到一行摘要，说明您离开期间发生了什么。在同时运行多个 Claude 会话时，有助于保持工作流程。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/FTi4SBJ9YRs7d-5X/images/whats-new/session-recap.mp4?fit=max&auto=format&n=FTi4SBJ9YRs7d-5X&q=85&s=0a8db1470bd0161a47efeb2f322af76f" data-path="images/whats-new/session-recap.mp4" />
  </Frame>

  <p className="digest-feature-try">按需生成摘要，或从 <code>/config</code> 关闭自动摘要：</p>

  ```text Claude Code theme={null}
  > /recap
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/interactive-mode#session-recap">交互模式：会话摘要</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">自定义主题</span>
    <span className="digest-feature-pill">v2.1.118</span>
  </div>

  <p className="digest-feature-lede">从 <code>/theme</code> 构建和切换命名颜色主题，或在 <code>\~/.claude/themes/</code> 中手动编辑 JSON 文件。每个主题选择一个基础预设，并仅覆盖您关心的令牌。插件也可以附带主题。</p>

  <p className="digest-feature-try">打开主题选择器并创建新主题：</p>

  ```text Claude Code theme={null}
  > /theme
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/terminal-config#create-a-custom-theme">终端配置：创建自定义主题</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">网页版 Claude Code</span>
    <span className="digest-feature-pill">web</span>
  </div>

  <p className="digest-feature-lede"><a href="https://claude.ai/code">claude.ai/code</a> 的新外观与重新设计的桌面应用相匹配：会话侧边栏、拖放布局和刷新的例程视图。关键部分已重建，以实现更快的响应和更可靠的体验。</p>

  <Frame>
    <img className="w-full" src="https://mintcdn.com/claude-code/FTi4SBJ9YRs7d-5X/images/whats-new/web-redesign.jpeg?fit=max&auto=format&n=FTi4SBJ9YRs7d-5X&q=85&s=a2aca1b49e295b7337f5779038db8e2c" alt="网页版 Claude Code 重新设计概览：新 UI、速度和可靠性、跨网页、移动和 CLI 工作" width="1602" height="1610" data-path="images/whats-new/web-redesign.jpeg" />
  </Frame>

  <a className="digest-feature-link" href="/docs/zh-CN/docs/claude-code-on-the-web">网页版 Claude Code</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他改进</p>

  <div className="digest-wins-grid">
    <div><a href="/docs/zh-CN/docs/interactive-mode#vim-editor-mode">Vim 可视模式</a>：在提示输入中按 <code>v</code> 进行字符选择或按 <code>V</code> 进行行选择，带有运算符和可视反馈</div>
    <div>Hooks 现在可以通过 <a href="/docs/zh-CN/docs/hooks#mcp-tool-hook-fields"><code>type: "mcp\_tool"</code></a> 直接调用 MCP 工具，因此 hook 可以访问已连接的服务器，而无需生成进程</div>
    <div><code>/cost</code> 和 <code>/stats</code> 已合并到 <a href="/docs/zh-CN/docs/commands"><code>/usage</code></a>；旧名称仍然可用作打开相关选项卡的输入快捷方式</div>
    <div><code>/config</code> 更改（主题、编辑器模式、详细信息等）现在持久化到 <code>\~/.claude/settings.json</code>，并遵循与其他 <a href="/docs/zh-CN/docs/settings">设置</a> 相同的项目/本地/策略优先级</div>
    <div><a href="/docs/zh-CN/docs/sub-agents#fork-the-current-conversation">分叉的子代理</a> 可以通过 <code>CLAUDE\_CODE\_FORK\_SUBAGENT=1</code> 在外部构建上启用：分叉继承您的完整对话上下文，而不是从头开始</div>
    <div>Pro 和 Max 订阅者在 Opus 4.6 和 Sonnet 4.6 上的默认 <a href="/docs/zh-CN/docs/model-config#adjust-effort-level">努力级别</a> 现在是 <code>high</code>（之前是 <code>medium</code>）</div>
    <div>原生 macOS 和 Linux 构建用嵌入式 <code>bfs</code> 和 <code>ugrep</code>（通过 Bash 可用）替换了 <code>Glob</code> 和 <code>Grep</code> 工具，可实现更快的搜索，无需单独的工具往返</div>
    <div><code>--from-pr</code> 现在除了接受 github.com 外，还接受 GitLab 合并请求、Bitbucket 拉取请求和 GitHub Enterprise PR URL</div>
    <div>自动模式：在 <a href="/docs/zh-CN/docs/auto-mode-config"><code>autoMode.allow</code>、<code>soft\_deny</code> 或 <code>environment</code></a> 中包含 <code>"\$defaults"</code>，以在内置列表旁边添加自定义规则，而不是替换它</div>
    <div>新的 <a href="/docs/zh-CN/docs/plugin-dependencies#tag-plugin-releases-for-version-resolution"><code>claude plugin tag</code></a> 命令为具有版本验证的插件创建发布 git 标签</div>
    <div>Opus 4.7 会话现在针对模型的原生 1M 上下文窗口进行计算，修复了膨胀的 <code>/context</code> 百分比和过早的自动压缩</div>
    <div><code>/resume</code> 在大型会话上的速度提高了 67%，现在在重新读取之前提供总结陈旧的大型会话的选项</div>
  </div>
</div>

[v2.1.114–v2.1.119 的完整更新日志 →](/docs/en/changelog#2-1-114)
