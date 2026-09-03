> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第 27 周 · 6 月 29 日 – 7 月 3 日，2026 年

> Claude Sonnet 5 成为默认模型，Claude in Chrome 正式推出，子代理默认在后台运行，Claude Desktop 在 Linux 上推出测试版，/radio 调入 Claude FM。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-195">v2.1.195 → v2.1.201</a></span>
  <span>5 项功能 · 6 月 29 日 – 7 月 3 日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Claude Sonnet 5</span>
    <span className="digest-feature-pill">新模型</span>
  </div>

  <p className="digest-feature-lede">Sonnet 5 是 Pro、Team Standard 和 Enterprise 订阅席位的新默认模型：以 Sonnet 定价提供顶级编码和工具使用能力，具有原生 1M 令牌上下文窗口和默认启用的自适应思考。API 定价在 8 月 31 日前为促销价格，每 MTok 2 美元/10 美元。需要 v2.1.197 或更高版本。</p>

  <p className="digest-feature-try">按名称切换到 Sonnet 5，或从模型选择器中选择：</p>

  ```text Claude Code theme={null}
  > /model claude-sonnet-5
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/model-config#available-models">模型配置</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Claude in Chrome 正式推出</span>
    <span className="digest-feature-pill">v2.1.198</span>
  </div>

  <p className="digest-feature-lede">Chrome 集成已对所有直接 Anthropic 计划的用户正式推出预览版。Claude Code 通过 Claude in Chrome 扩展程序驱动您的浏览器：它打开标签页、点击浏览页面、填充表单、读取控制台日志并共享您的登录状态，因此它可以测试它构建的应用程序，而无需您切换上下文。</p>

  <a className="digest-feature-link" href="/docs/zh-CN/docs/chrome">使用 Claude Code 与 Chrome</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">子代理默认在后台运行</span>
    <span className="digest-feature-pill">v2.1.198</span>
  </div>

  <p className="digest-feature-lede">Claude 现在在子代理运行时继续工作，并在子代理完成时获取其结果，而不是暂停对话以等待。Claude 仍然在需要结果才能继续时在前台运行子代理，后台子代理在您的主会话中显示每个权限提示。使用 <code>background</code> frontmatter 字段固定子代理的行为。</p>

  <a className="digest-feature-link" href="/docs/zh-CN/docs/sub-agents#run-subagents-in-foreground-or-background">在前台或后台运行子代理</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Claude Desktop on Linux</span>
    <span className="digest-feature-pill">Desktop</span>
  </div>

  <p className="digest-feature-lede">Claude 桌面应用现已在 Ubuntu 22.04+ 和 Debian 12+ 上以测试版形式提供，支持 x86\_64 和 arm64。您可以获得与 macOS 和 Windows 相同的 Chat、Cowork 和 Claude Code 体验：并行会话、可视化差异审查、集成终端和编辑器以及实时应用预览。从 Anthropic 的 apt 存储库安装，因此更新通过常规包更新到达。</p>

  <a className="digest-feature-link" href="/docs/zh-CN/docs/desktop-linux">Claude Desktop on Linux</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">/radio</span>
    <span className="digest-feature-pill">CLI</span>
  </div>

  <p className="digest-feature-lede">Claude FM 已上线。<code>/radio</code> 在您的浏览器中打开 lo-fi 电台流，用于编码时的背景音乐，当没有浏览器可用时打印流 URL。在 Amazon Bedrock、Google Cloud 的 Agent Platform 或 Microsoft Foundry 上不可用。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/x358isu_VzLnyTEN/images/whats-new/radio.mp4?fit=max&auto=format&n=x358isu_VzLnyTEN&q=85&s=36a0c33859cef119c7192dceea8bcbd3" data-path="images/whats-new/radio.mp4" />
  </Frame>

  <p className="digest-feature-try">从任何会话调入：</p>

  ```text Claude Code theme={null}
  > /radio
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/commands#all-commands">所有命令</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他亮点</p>

  <div className="digest-wins-grid">
    <div><a href="/docs/zh-CN/docs/artifacts">Artifacts</a> 现已正式推出，包含在 Pro 和 Max 计划中，加入 Team 和 Enterprise</div>
    <div>管理员可以在组织控制台中设置 <a href="/docs/zh-CN/docs/model-config#organization-default-model">组织默认模型</a>；当您尚未选择模型时，它在 <code>/model</code> 中显示为"组织默认"</div>
    <div>堆叠的技能调用，如 <code>/skill-a /skill-b do XYZ</code>，现在加载所有前导技能（最多 5 个），而不仅仅是第一个</div>
    <div><code>AskUserQuestion</code> 对话框默认不再自动继续；通过 <code>/config</code> 选择加入空闲超时</div>
    <div>"default"权限模式现在在 CLI、`--help`、VS Code 和 JetBrains 中命名为"Manual"；`--permission-mode manual` 与 `default` 一起被接受</div>
    <div>新的 <code>/dataviz</code> 技能提供图表和仪表板设计指导，带有可运行的调色板验证器</div>
    <div>内置的 Explore 代理现在继承主会话的模型（上限为 Opus），而不是在 Haiku 上运行</div>
    <div>从 <code>claude agents</code> 启动的后台代理现在在 worktree 中完成代码工作时提交、推送并打开草稿 PR，而不是停止询问</div>
    <div>带有连字符标识符（如 <code>code-reviewer</code>）的 Hook 匹配器现在精确匹配而不是子字符串匹配；使用 <code>mcp\_\_brave-search\_\_.\*</code> 匹配来自连字符 MCP 服务器的所有工具</div>
    <div>与您的使用限制无关的瞬时服务器速率限制错误现在对订阅者自动重试并进行退避，而不是使轮次失败</div>
    <div>流式空闲监视程序现在默认对所有提供商启用：当响应流在 5 分钟内不产生任何事件时，它会中止并重试（<code>CLAUDE\_ENABLE\_STREAM\_WATCHDOG=0</code> 禁用）</div>
  </div>
</div>

[v2.1.195–v2.1.201 的完整更新日志 →](/docs/en/changelog#2-1-195)
