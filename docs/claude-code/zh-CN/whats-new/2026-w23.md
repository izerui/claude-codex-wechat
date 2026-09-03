> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第 23 周 · 2026 年 6 月 1–5 日

> 在 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上运行自动模式，在 acceptEdits 模式下提示写入可运行代码的文件，使用 /plugin list 列出已安装的插件，以及为托管部署要求批准的版本范围。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-158">v2.1.158 → v2.1.165</a></span>
  <span>4 项功能 · 6 月 1–5 日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上的自动模式</span>
    <span className="digest-feature-pill">v2.1.158</span>
  </div>

  <p className="digest-feature-lede">自动模式现已在 Amazon Bedrock、Google Cloud 的 Agent Platform 和 Microsoft Foundry 上可用，支持 Opus 4.7 和 Opus 4.8，用第三方提供商的后台安全检查替代权限提示。通过设置 <code>CLAUDE\_CODE\_ENABLE\_AUTO\_MODE=1</code> 来选择加入。</p>

  <p className="digest-feature-try">在第三方提供商上选择加入，然后使用 Shift+Tab 切换到自动模式：</p>

  ```bash terminal theme={null}
  export CLAUDE_CODE_ENABLE_AUTO_MODE=1
  ```

  <a className="digest-feature-link" href="/docs/docs/zh-CN/permission-modes#enable-auto-mode-on-bedrock-agent-platform-or-foundry">在第三方提供商上启用自动模式</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">更安全的自动编辑</span>
    <span className="digest-feature-pill">v2.1.160</span>
  </div>

  <p className="digest-feature-lede">Claude Code 现在在写入可运行代码的文件之前进行提示，即使在 <code>acceptEdits</code> 模式下也是如此。受保护的集合包括 shell 启动文件，如 <code>.zshenv</code> 和 <code>.bash\_login</code>、<code>\~/.config/git/</code> 下的 git 配置，以及构建工具配置，如 <code>.npmrc</code>、<code>.bazelrc</code> 和 <code>.pre-commit-config.yaml</code>。除了 <code>bypassPermissions</code> 模式外，这些写入在任何模式下都不会自动批准。</p>

  <p className="digest-feature-try">在 acceptEdits 模式下工作；Claude 现在在写入这些文件之前暂停：</p>

  ```bash terminal theme={null}
  claude --permission-mode acceptEdits
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/permission-modes#protected-paths">受保护的路径</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">使用 /plugin list 列出已安装的插件</span>
    <span className="digest-feature-pill">v2.1.163</span>
  </div>

  <p className="digest-feature-lede">新的 <code>/plugin list</code> 命令内联打印已安装的插件，无需打开 <code>/plugin</code> 菜单，也可从 shell 中作为 <code>claude plugin list</code> 使用。在交互形式中，添加 `--enabled` 或 `--disabled` 以仅显示处于该状态的插件。</p>

  <p className="digest-feature-try">列出当前打开的插件：</p>

  ```text Claude Code theme={null}
  > /plugin list --enabled
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/plugins-reference#plugin-list">插件命令</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">托管部署的版本要求</span>
    <span className="digest-feature-pill">v2.1.163</span>
  </div>

  <p className="digest-feature-lede">两个托管设置 <code>requiredMinimumVersion</code> 和 <code>requiredMaximumVersion</code> 允许您的组织要求批准的 Claude Code 版本范围。超出范围的客户端在启动时退出，并告诉用户通过组织的方法进行更新。<code>claude update</code>、<code>claude install</code> 和 <code>claude doctor</code> 继续工作，以便用户仍然可以恢复。</p>

  <p className="digest-feature-try">向托管设置添加下限，以便较旧的客户端拒绝启动：</p>

  ```json managed-settings.json theme={null}
  {
    "requiredMinimumVersion": "2.1.163"
  }
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/admin-setup#decide-what-to-enforce">决定要强制执行的内容</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他改进</p>

  <div className="digest-wins-grid">
    <div><a href="/docs/zh-CN/docs/workflows">动态工作流</a>的触发关键字从 <code>workflow</code> 更改为 <code>ultracode</code>；用您自己的话要求工作流仍然有效，关键字在提示中以紫色突出显示</div>
    <div><a href="/docs/zh-CN/docs/hooks">Stop 和 SubagentStop hooks</a> 可以返回 <code>hookSpecificOutput.additionalContext</code> 以向 Claude 提供反馈并继续轮次，而不是被视为错误</div>
    <div><code>claude mcp</code> list、get 和 add 不再打印机密：环境变量引用不会展开，凭证标头和 URL 机密会被编辑</div>
    <div>并行工具批处理中失败的 Bash 命令不再取消其他命令；每个工具独立返回自己的结果</div>
    <div>当您使用单文件 <code>grep</code>、<code>egrep</code> 或 <code>fgrep</code> 查看文件时，编辑文件不再需要单独的 Read</div>
    <div>单击自动完成菜单中的命令现在会将其填充到您的提示中，而不是立即运行；按 Enter 键运行</div>
    <div>在 `--tools` 中列出 <code>Grep</code> 或 <code>Glob</code> 现在在具有嵌入式搜索的本机构建上提供专用搜索工具，而不是静默忽略这些名称</div>
    <div><code>/effort</code> 现在确认您选择的级别将作为新会话的默认值持久化</div>
    <div><code>OTEL\_RESOURCE\_ATTRIBUTES</code> 值现在作为标签附加到指标数据点，因此您可以按自定义维度（如团队或存储库）对使用指标进行切片</div>
    <div>Windsurf 在 <code>/ide</code>、<code>/terminal-setup</code> 和 <code>/scroll-speed</code> 中重命名为 Devin Desktop，遵循编辑器的品牌重塑</div>
    <div><code>/btw</code> 获得了 <code>c to copy</code> 快捷键，可将原始 markdown 答案复制到剪贴板</div>
  </div>
</div>

[v2.1.158–v2.1.165 的完整更新日志 →](/docs/en/changelog#2-1-158)
