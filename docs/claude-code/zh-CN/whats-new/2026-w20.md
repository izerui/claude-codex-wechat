> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第 20 周 · 2026 年 5 月 11–15 日

> 从一个屏幕管理每个 Claude Code 会话，使用 agent view，让 Claude 持续朝着目标工作直到条件满足，并在 Opus 4.7 上默认运行快速模式。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-139">v2.1.139 → v2.1.142</a></span>
  <span>3 项功能 · 5 月 11–15</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Agent view</span>
    <span className="digest-feature-pill">research preview</span>
  </div>

  <p className="digest-feature-lede"><code>claude agents</code> 为每个 Claude Code 会话打开一个屏幕：显示正在运行的内容、被阻止等待您输入的内容以及已完成的内容。分派一个错误修复、一个拉取请求审查和一个不稳定测试调查作为三行，在另一个窗口中继续工作，仅在某一行需要您时才介入。附加到任何行以进入其完整对话，然后按 <code>←</code> 返回列表。每个后台会话在没有附加终端的情况下继续运行。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/ITvjicPxe1SM3GX7/images/whats-new/agent-view.mp4?fit=max&auto=format&n=ITvjicPxe1SM3GX7&q=85&s=0eefe6cbe75464c8f7902bba630ab7a4" data-path="images/whats-new/agent-view.mp4" />
  </Frame>

  <p className="digest-feature-try">从您的 shell 打开仪表板：</p>

  ```bash terminal theme={null}
  claude agents
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/agent-view">Agent view</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">/goal</span>
    <span className="digest-feature-pill">v2.1.139</span>
  </div>

  <p className="digest-feature-lede">设置完成条件，Claude 会在多个回合中持续朝着该条件工作，无需您在每一步进行提示。在每个回合之后，一个快速模型检查条件是否满足；如果不满足，Claude 会开始另一个回合，而不是将控制权交还给您。适用于具有可验证结束状态的大量工作，例如迁移模块直到每个调用站点都编译并通过测试。一旦条件满足，目标就会清除，并在交互式、<code>-p</code> 和 Remote Control 中工作。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/ITvjicPxe1SM3GX7/images/whats-new/goal.mp4?fit=max&auto=format&n=ITvjicPxe1SM3GX7&q=85&s=6806df3780c548b93a02d6fa71da276b" data-path="images/whats-new/goal.mp4" />
  </Frame>

  <p className="digest-feature-try">设置一个目标并让 Claude 运行直到它满足：</p>

  ```text Claude Code theme={null}
  > /goal all tests in test/auth pass and the lint step is clean
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/goal">Goals</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Fast mode on Opus 4.7</span>
    <span className="digest-feature-pill">research preview</span>
  </div>

  <p className="digest-feature-lede"><code>/fast</code> 现在默认在 Opus 4.7 上运行，而不是 Opus 4.6。快速模式是一个高速 Opus 配置：相同的模型质量，速度约为 2.5 倍，但每个令牌的成本更高，适用于快速迭代和实时调试。定价保持不变，为 $30/$150 每 MTok，与 Opus 4.6 快速模式相同。要将快速模式固定到 Opus 4.6，请设置 <code>CLAUDE\_CODE\_OPUS\_4\_6\_FAST\_MODE\_OVERRIDE=1</code>。</p>

  <Frame>
    <img className="w-full" src="https://mintcdn.com/claude-code/ITvjicPxe1SM3GX7/images/whats-new/fast-mode-opus-47.png?fit=max&auto=format&n=ITvjicPxe1SM3GX7&q=85&s=6b6d92f7748ce5328a1ee9a269fb1a87" alt="Claude Code 模型选择器显示 Opus 4.7 Fast 1M 作为默认值，并启用了 Fast 切换" width="3840" height="2160" data-path="images/whats-new/fast-mode-opus-47.png" />
  </Frame>

  <p className="digest-feature-try">切换快速模式，现在在 Opus 4.7 上运行：</p>

  ```text Claude Code theme={null}
  > /fast
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/fast-mode#understand-the-cost-tradeoff">Fast mode on Opus 4.7</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他改进</p>

  <div className="digest-wins-grid">
    <div><code>claude agents</code> 获得了分派标志（<code>--add-dir</code>、<code>--settings</code>、<code>--mcp-config</code>、<code>--plugin-dir</code>、<code>--permission-mode</code>、<code>--model</code>、<code>--effort</code>、<code>--dangerously-skip-permissions</code>）来配置后台会话，<code>claude agents --cwd \<path></code> 将会话列表范围限制在一个目录</div>
    <div>新的 hook <code>args: string\[]</code> exec 形式直接生成命令而不使用 shell，因此路径占位符永远不需要引用</div>
    <div>新的 <code>continueOnBlock</code> 配置选项用于 <code>PostToolUse</code> hooks，将 hook 的拒绝原因反馈给 Claude 并继续该回合，而不是结束它</div>
    <div>hook JSON 输出中的新 <code>terminalSequence</code> 字段让 hooks 发出桌面通知、窗口标题和铃声，无需控制终端</div>
    <div>Rewind 菜单添加了"总结到此处"以压缩早期上下文，同时保持最近的回合完整</div>
    <div>当设置 <code>ANTHROPIC\_API\_KEY</code>、<code>apiKeyHelper</code> 或 <code>ANTHROPIC\_AUTH\_TOKEN</code> 时，Remote Control、<code>/schedule</code>、Claude.ai MCP 连接器和通知首选项现在被禁用，即使与 Claude.ai 登录一起使用；取消设置 API 密钥以使用这些功能</div>
    <div>MCP stdio 服务器现在在其环境中接收 <code>CLAUDE\_PROJECT\_DIR</code>，与 hooks 匹配，插件配置可以在命令中引用 <code>\${"{"}CLAUDE\_PROJECT\_DIR{"}"}</code></div>
    <div><code>claude plugin details \<name></code> 显示插件的组件清单和预计的每个会话令牌成本，<code>/plugin</code> 详细信息窗格现在也列出了插件提供的 LSP 服务器</div>
    <div>具有根级 <code>SKILL.md</code> 且没有 <code>skills/</code> 子目录的插件现在被显示为一个 skill</div>
    <div><code>/feedback</code> 现在可以包括过去 24 小时或 7 天内的最近会话，用于跨越多个会话的问题</div>
    <div>Agent tool <code>subagent\_type</code> 现在不区分大小写和分隔符匹配，因此 <code>"Code Reviewer"</code> 解析为 <code>code-reviewer</code></div>
  </div>
</div>

[v2.1.139–v2.1.142 的完整更新日志 →](/docs/en/changelog#2-1-139)
