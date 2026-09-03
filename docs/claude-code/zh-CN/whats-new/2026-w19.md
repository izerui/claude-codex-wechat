> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第19周 · 2026年5月4–8日

> 从.zip存档和URL加载插件，使用Ctrl+R跨每个项目搜索命令历史，从本地HEAD或远程默认分支创建新worktrees，以及使用自动模式硬拒绝规则无条件阻止操作。

<div className="digest-meta">
  <span>Releases <a href="/docs/docs/en/changelog#2-1-128">v2.1.128 → v2.1.136</a></span>
  <span>2 features · 5月4–8日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">从.zip存档和URL加载插件</span>
  </div>

  <p className="digest-feature-lede">`--plugin-dir` 现在除了接受目录外，还接受 <code>.zip</code> 插件存档，新的 `--plugin-url` 标志可以从URL为当前会话获取插件存档。这对于在将插件添加到marketplace之前尝试插件，或从artifact store发送内部插件很有用。</p>

  <p className="digest-feature-try">直接从URL加载插件：</p>

  ```bash terminal theme={null}
  claude --plugin-url https://example.com/my-plugin.zip
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/plugins">Plugins指南</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">跨所有项目搜索历史</span>
    <span className="digest-feature-pill">v2.1.129</span>
  </div>

  <p className="digest-feature-lede"><code>Ctrl+R</code> 反向搜索现在默认搜索所有项目中的所有提示，恢复了v2.1.124之前的行为。在搜索时按 <code>Ctrl+S</code> 可以缩小范围到当前项目或会话。当你记得上周在另一个repo中运行的命令，但不想费力去寻找时，这很方便。</p>

  <a className="digest-feature-link" href="/docs/zh-CN/interactive-mode#command-history">Interactive mode：命令历史</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他改进</p>

  <div className="digest-wins-grid">
    <div>新的 <code>worktree.baseRef</code> 设置（<code>fresh</code> | <code>head</code>）控制 <code>--worktree</code>、<code>EnterWorktree</code> 工具和agent-isolation worktrees是从远程默认分支还是本地 <code>HEAD</code> 创建分支；默认的 <code>fresh</code> 将未推送的提交排除在新worktrees之外</div>
    <div>新的 <code>settings.autoMode.hard\_deny</code> 规则在自动模式下无条件阻止匹配的操作，无论allow例外如何，用于不应该自动运行的操作，即使应用了更广泛的allow规则</div>
    <div>Hooks现在通过 `effort.level` JSON输入字段和 `$CLAUDE_EFFORT` 环境变量接收活跃的effort level，Bash工具命令可以读取 <code>\$CLAUDE\_EFFORT</code></div>
    <div><code>CLAUDE\_CODE\_DISABLE\_ALTERNATE\_SCREEN=1</code> 选择退出全屏alternate-screen渲染器，并将对话保留在终端的原生scrollback中</div>
    <div><code>CLAUDE\_CODE\_PACKAGE\_MANAGER\_AUTO\_UPDATE</code> 允许Homebrew或WinGet安装在后台运行升级并提示重启</div>
    <div><code>CLAUDE\_CODE\_SESSION\_ID</code> 现在在Bash工具子进程环境中，与传递给hooks的 <code>session\_id</code> 匹配</div>
    <div><code>/mcp</code> 现在显示已连接服务器的工具计数，并标记以0个工具连接的服务器</div>
    <div><code>--channels</code> 现在适用于console（API key）身份验证</div>
    <div>Bash、hooks、MCP和LSP等子进程不再继承 <code>OTEL\_\*</code> 环境变量，因此通过Bash工具运行的OTEL检测应用不再获取CLI自己的OTLP端点</div>
    <div>Sub-agent进度摘要现在命中prompt cache，将 <code>cache\_creation</code> token成本降低约3倍</div>
    <div>多个OAuth和凭证可靠性修复：并行会话在refresh-token竞争后不再在401处死亡，MCP OAuth刷新令牌在多个服务器并发刷新时不再丢失，并修复了来自并发凭证写入的罕见登录循环</div>
    <div>新的 <code>parentSettingsBehavior</code> 管理员密钥让管理员选择SDK <code>managedSettings</code> 进入策略合并</div>
  </div>
</div>

[v2.1.128–v2.1.136的完整更新日志 →](/docs/en/changelog#2-1-128)
