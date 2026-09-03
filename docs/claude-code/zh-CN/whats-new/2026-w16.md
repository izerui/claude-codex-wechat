> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第 16 周 · 2026 年 4 月 13–17 日

> Claude Opus 4.7 配备新的 xhigh 努力级别、Claude Code 网页版上的 Routines、移动推送通知在 Claude 需要您时 ping 您的手机、显示限制驱动因素的 /usage 分解，以及替代捆绑 JavaScript 的原生二进制文件。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-105">v2.1.105 → v2.1.113</a></span>
  <span>5 项功能 · 4 月 13–17 日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Claude Opus 4.7</span>
    <span className="digest-feature-pill">新模型</span>
  </div>

  <p className="digest-feature-lede">Anthropic 最强大的编码模型现在是 Max 和 Team Premium 的默认模型，也可以从 <code>/model</code> 在其他地方使用。它添加了一个新的 <code>xhigh</code> 努力级别，位于 <code>high</code> 和 <code>max</code> 之间：为大多数编码和代理任务提供最佳结果，在您第一次切换到 4.7 时应用为默认值。<code>/effort</code> 现在在您不带参数调用它时打开一个交互式箭头键滑块，因此您可以在不记住级别名称的情况下平衡智能与速度。</p>

  <p className="digest-feature-try">一次性切换模型和努力级别：</p>

  ```text Claude Code theme={null}
  > /model opus
  > /effort xhigh
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/model-config#adjust-effort-level">模型配置：努力级别</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Routines</span>
    <span className="digest-feature-pill">web</span>
  </div>

  <p className="digest-feature-lede">模板化云代理，按计划、GitHub 事件或 API 调用触发。在 Claude Code 网页版上定义一次例程，包括提示、它可以接触的仓库和它需要的连接器，然后让 PR 打开、发布发布或您自己的 webhook 在您的机器不运行的情况下触发它。触发选择器现在涵盖 GitHub 事件和可选过滤器，并为每个例程提供一个令牌化的 <code>/fire</code> 端点供外部系统使用。</p>

  <Frame>
    <img className="w-full" src="https://mintcdn.com/claude-code/FTi4SBJ9YRs7d-5X/images/whats-new/routines.png?fit=max&auto=format&n=FTi4SBJ9YRs7d-5X&q=85&s=2ba818ea9280c549511cb48b9b4d1dc5" alt="在 Claude Code 网页版上创建具有计划、GitHub 事件和 API 触发器的例程" width="1440" height="810" data-path="images/whats-new/routines.png" />
  </Frame>

  <p className="digest-feature-try">从网页 UI 创建一个，或从您的终端搭建：</p>

  ```text Claude Code theme={null}
  > /schedule daily PR review at 9am
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/routines">Routines 指南</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">/usage breakdown</span>
    <span className="digest-feature-pill">CLI</span>
  </div>

  <p className="digest-feature-lede">更好地了解您的 Claude Code 使用情况。<code>/usage</code> 现在显示驱动您的限制的因素：并行会话、子代理、缓存未命中和长上下文，每个都显示过去 24 小时的百分比和优化提示。按 <code>d</code> 或 <code>w</code> 在日视图和周视图之间切换。</p>

  <Frame>
    <img className="w-full" src="https://mintcdn.com/claude-code/FTi4SBJ9YRs7d-5X/images/whats-new/usage.png?fit=max&auto=format&n=FTi4SBJ9YRs7d-5X&q=85&s=792a4b43cbef4e2931974831f076bca6" alt="/usage 命令显示对限制使用的贡献分解" width="1204" height="1182" data-path="images/whats-new/usage.png" />
  </Frame>

  <p className="digest-feature-try">随时运行它：</p>

  ```text Claude Code theme={null}
  > /usage
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/commands">命令参考</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">移动推送通知</span>
    <span className="digest-feature-pill">mobile</span>
  </div>

  <p className="digest-feature-lede">连接了 <a href="/docs/zh-CN/docs/remote-control">Remote Control</a>，Claude 可以在长任务完成或需要决定继续时向您的手机发送推送通知。在 <code>/config</code> 中使用"Claude 决定时推送"打开它，或在您的提示中请求一个。当您启动长代理运行并想离开终端时很有用。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/uII1TETOZxBUZ3lB/images/whats-new/push-notifications.mp4?fit=max&auto=format&n=uII1TETOZxBUZ3lB&q=85&s=c91a967139596500cbdb581a53822ac1" data-path="images/whats-new/push-notifications.mp4" />
  </Frame>

  <p className="digest-feature-try">要求 Claude 在完成时 ping 您：</p>

  ```text Claude Code theme={null}
  > notify me when the tests pass
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/remote-control#mobile-push-notifications">Remote Control：移动推送通知</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">原生二进制文件</span>
    <span className="digest-feature-pill">v2.1.113</span>
  </div>

  <p className="digest-feature-lede"><code>claude</code> CLI 现在生成原生的每平台二进制文件，而不是捆绑的 JavaScript，因此已安装的 <code>claude</code> 命令不再调用 Node。npm 包通过可选依赖项（如 <code>@anthropic-ai/claude-code-darwin-arm64</code>）拉入正确的二进制文件，因此您的安装命令不会改变。独立安装程序已经提供了此二进制文件；npm 现在与其匹配。</p>

  <p className="digest-feature-try">升级并检查您正在运行的内容：</p>

  ```bash theme={null}
  claude update
  claude --version
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/setup">设置指南</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他亮点</p>

  <div className="digest-wins-grid">
    <div>新的 <a href="/docs/zh-CN/docs/ultrareview"><code>/ultrareview</code></a>：使用并行多代理分析和对抗性批评通过在云中进行全面代码审查。不带参数运行它来审查您当前的分支，或 <code>/ultrareview \<PR#></code> 来审查特定 PR</div>
    <div><a href="/docs/zh-CN/docs/permission-modes#eliminate-prompts-with-auto-mode">自动模式</a>现在可供 Max 订阅者在 Opus 4.7 上使用，<code>--enable-auto-mode</code> 标志不再需要</div>
    <div><a href="/docs/zh-CN/docs/interactive-mode#session-recap">会话回顾</a>显示您离开时发生的一行摘要；按需运行 <code>/recap</code> 或从 <code>/config</code> 关闭它</div>
    <div>新的 <code>/tui</code> 命令和 <code>tui</code> 设置在对话中间切换经典和无闪烁渲染；焦点视图从 <code>Ctrl+O</code> 移至其自己的 <code>/focus</code> 命令</div>
    <div>插件可以通过顶级 <code>monitors</code> 清单键提供后台监视器，在会话启动或技能调用时自动启用</div>
    <div><code>/theme</code> 中的"自动（匹配终端）"选项遵循您的终端的深色/浅色模式</div>
    <div><code>/fewer-permission-prompts</code> 扫描您的记录以查找常见的只读 Bash 和 MCP 调用，并为 <code>.claude/settings.json</code> 提议一个允许列表</div>
    <div>Claude 现在可以通过 Skill 工具发现并运行内置命令，如 <code>/init</code>、<code>/review</code> 和 <code>/security-review</code></div>
    <div><code>PreCompact</code> hooks 可以通过以代码 2 退出或返回 <code>{"{"}"decision":"block"{"}"}</code> 来阻止压缩</div>
    <div><code>ENABLE\_PROMPT\_CACHING\_1H</code> 选择 API 密钥、Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 用户进入 1 小时提示缓存 TTL</div>
    <div><code>sandbox.network.deniedDomains</code> 设置从更广泛的 <code>allowedDomains</code> 通配符中分离特定域</div>
    <div><code>/undo</code> 现在是 <code>/rewind</code> 的别名，<code>/proactive</code> 是 <code>/loop</code> 的别名</div>
    <div>强化的 Bash 权限：拒绝规则现在通过 <code>env</code>/<code>sudo</code>/<code>watch</code> 包装器匹配，<code>Bash(find:\*)</code> 允许规则不再自动批准 <code>-exec</code> 或 <code>-delete</code></div>
  </div>
</div>

[v2.1.105–v2.1.113 的完整更改日志 →](/docs/en/changelog#2-1-105)
