> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第 22 周 · 2026 年 5 月 25–29 日

> 在 Claude Opus 4.8 上运行 Claude Code，使用动态工作流编排大型任务，使用 security-guidance 插件捕获安全问题，并以更低的价格在 Opus 4.8 上使用快速模式。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-150">v2.1.150 → v2.1.157</a></span>
  <span>4 项功能 · 5 月 25–29</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Claude Opus 4.8</span>
    <span className="digest-feature-pill">新模型</span>
  </div>

  <p className="digest-feature-lede">Opus 4.8 现在是 Max、Team Premium、Enterprise 按量付费和 Anthropic API 上的默认模型。它默认为高努力级别；对于更难的任务，使用 <code>/effort xhigh</code>。需要 v2.1.154 或更高版本。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/QsIrGXGFg6xd7joy/images/whats-new/opus-4-8.mp4?fit=max&auto=format&n=QsIrGXGFg6xd7joy&q=85&s=6ebcf5fe136467da2b254de1fe749ea7" data-path="images/whats-new/opus-4-8.mp4" />
  </Frame>

  <p className="digest-feature-try">按名称切换到 Opus 4.8，或从模型选择器中选择它：</p>

  ```text Claude Code theme={null}
  > /model claude-opus-4-8
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/model-config#available-models">模型配置</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Dynamic workflows</span>
    <span className="digest-feature-pill">研究预览</span>
  </div>

  <p className="digest-feature-lede">工作流是 Claude 为您的任务编写的编排脚本，在后台跨许多子代理运行。当任务太大而无法由一个对话来协调时，请使用工作流：整个代码库审计、大型迁移、需要交叉检查的研究问题。使用 <code>/workflows</code> 管理运行。</p>

  <Frame>
    <img className="w-full" src="https://mintcdn.com/claude-code/QsIrGXGFg6xd7joy/images/whats-new/dynamic-workflows.png?fit=max&auto=format&n=QsIrGXGFg6xd7joy&q=85&s=26671fa8607cec3453ed9753f821bd4f" alt="Claude Code on Opus 4.8 showing a Dynamic workflow requested indicator for a prompt that asks for a workflow to migrate every internal fetch() call" width="3840" height="2160" data-path="images/whats-new/dynamic-workflows.png" />
  </Frame>

  <p className="digest-feature-try">描述任务并请求工作流：</p>

  ```text Claude Code theme={null}
  > create a workflow that migrates every internal fetch() call to the new HttpClient wrapper
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/workflows">Dynamic workflows</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Security guidance plugin</span>
    <span className="digest-feature-pill">插件</span>
  </div>

  <p className="digest-feature-lede">security-guidance 插件审查 Claude 的代码更改是否存在漏洞，并在同一会话中修复它们。它在每次编辑时运行快速模式检查，在每个回合结束时进行模型审查，以及在提交或推送时进行更深入的代理审查。在 <code>.claude/claude-security-guidance.md</code> 中添加项目规则。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/QsIrGXGFg6xd7joy/images/whats-new/security-guidance.mp4?fit=max&auto=format&n=QsIrGXGFg6xd7joy&q=85&s=c91d865936411586f42b24c558bcdd1d" data-path="images/whats-new/security-guidance.mp4" />
  </Frame>

  <p className="digest-feature-try">从官方 Anthropic 市场安装它：</p>

  ```text Claude Code theme={null}
  > /plugin install security-guidance@claude-plugins-official
  ```

  <p className="digest-feature-try">然后在当前会话中激活它：</p>

  ```text Claude Code theme={null}
  > /reload-plugins
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/security-guidance">Security guidance plugin</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Fast mode on Opus 4.8</span>
    <span className="digest-feature-pill">研究预览</span>
  </div>

  <p className="digest-feature-lede">快速模式现在默认为 Opus 4.8，价格为 \$10/\$50 每 MTok：标准速率的 2 倍，速度约为 2.5 倍。Opus 4.7 和 4.6 保持在 \$30/\$150。Opus 4.6 快速模式已弃用。</p>

  <p className="digest-feature-try">切换快速模式，现在在 Opus 4.8 上：</p>

  ```text Claude Code theme={null}
  > /fast
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/fast-mode#understand-the-cost-tradeoff">快速模式定价</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他亮点</p>

  <div className="digest-wins-grid">
    <div>在 <code>claude agents</code> 中，在 shell 命令前加上 <code>!</code> 以将其作为后台作业运行，您可以附加到该作业并从中分离；也可用作 <code>claude --bg --exec 'pytest -x'</code></div>
    <div><code>.claude/skills</code> 目录中的插件现在会自动加载，无需市场，<code>claude plugin init \<name></code> 为新插件搭建框架</div>
    <div>新的 <code>/reload-skills</code> 命令重新扫描技能目录而无需重启，<code>SessionStart</code> hooks 可以返回 <code>reloadSkills: true</code> 以使它们安装的技能在同一会话中可用</div>
    <div>技能和命令可以在 frontmatter 中设置 <code>disallowed-tools</code> 以在技能处于活动状态时从模型中删除工具</div>
    <div>新的 <code>MessageDisplay</code> hook 事件让 hooks 在显示助手消息文本时转换或隐藏它</div>
    <div>Claude Code 现在在找不到主模型时切换到您配置的 <code>--fallback-model</code> 以继续会话的其余部分，而不是使每个请求都失败</div>
    <div>插件可以在 <code>plugin.json</code> 或市场条目中声明 <code>defaultEnabled: false</code>，以便它们安装时不会打开，直到您启用它们</div>
    <div>Vim 模式：在 NORMAL 模式下按 <code>/</code> 打开反向历史搜索，与 Bash 和 Zsh vi-mode 匹配</div>
    <div>流式工具执行现在始终启用，包括在禁用遥测和在 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上</div>
    <div><code>←←</code> 打开代理视图现在在 Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry 和禁用遥测时有效</div>
    <div>Chrome 中的 Claude：通过 <code>/chrome</code> → "选择浏览器…" 选择要使用的连接浏览器，或在浏览器操作运行时在聊天中选择（当有多个连接时）</div>
    <div><code>claude mcp list</code> 和 <code>claude mcp get</code> 现在将未批准的 <code>.mcp.json</code> 服务器显示为待批准，而不是在输出被管道传输时自动批准和连接</div>
  </div>
</div>

[v2.1.150–v2.1.157 的完整更新日志 →](/docs/en/changelog#2-1-150)
