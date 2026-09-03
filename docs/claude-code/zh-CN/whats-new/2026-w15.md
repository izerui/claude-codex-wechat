> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第15周 · 2026年4月6–10日

> Ultraplan 云规划、具有自适应 /loop 的 Monitor 工具、用于打包设置的 /team-onboarding 以及从终端运行的 /autofix-pr。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-92">v2.1.92 → v2.1.101</a></span>
  <span>4 项功能 · 4月6–10日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Ultraplan</span>
    <span className="digest-feature-pill">研究预览</span>
  </div>

  <p className="digest-feature-lede">从终端在云中启动 Plan Mode，然后在浏览器中查看结果。Claude 在网络会话的 Claude Code 中起草计划，同时您的终端保持空闲；准备好后，您可以对各个部分进行评论、请求修订，并选择远程执行或将其发送回 CLI。从 v2.1.101 开始，首次运行会自动创建默认云环境，因此在尝试之前无需进行网络设置步骤。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/aFXPQxiBOW99MHS3/images/whats-new/ultraplan.mp4?fit=max&auto=format&n=aFXPQxiBOW99MHS3&q=85&s=e8f2f23730c6a5c289dbf3e7b13eadf6" data-path="images/whats-new/ultraplan.mp4" />
  </Frame>

  <p className="digest-feature-try">运行命令，或在任何提示中包含关键字：</p>

  ```text Claude Code theme={null}
  > /ultraplan migrate the auth service from sessions to JWTs
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/ultraplan">Ultraplan 指南</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">Monitor 工具</span>
    <span className="digest-feature-pill">v2.1.98</span>
  </div>

  <p className="digest-feature-lede">一个新的内置工具，可生成后台监视程序并将其事件流式传输到对话中：每个事件都作为新的转录消息出现，Claude 立即对其做出反应。跟踪训练运行、监督 PR 的 CI，或在开发服务器崩溃发生时立即自动修复，所有这些都无需 Bash sleep 循环占用回合。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/aFXPQxiBOW99MHS3/images/whats-new/monitor-tool.mp4?fit=max&auto=format&n=aFXPQxiBOW99MHS3&q=85&s=f4156c15a0999de5c5157f54a3117c89" data-path="images/whats-new/monitor-tool.mp4" />
  </Frame>

  <p className="digest-feature-try">要求 Claude 在您继续工作时监视某些内容：</p>

  ```text Claude Code theme={null}
  > Tail server.log in the background and tell me the moment a 5xx shows up
  ```

  <p className="digest-feature-try">这与 <code>/loop</code> 配对，现在可自适应：省略间隔，Claude 会根据任务安排下一个时刻，或使用 Monitor 工具完全跳过轮询。</p>

  ```text Claude Code theme={null}
  > /loop check CI on my PR
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/tools-reference#monitor-tool">Monitor 工具参考</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">/autofix-pr</span>
    <span className="digest-feature-pill">CLI</span>
  </div>

  <p className="digest-feature-lede">PR 自动修复在第 13 周登陆网络。现在您可以在不离开终端的情况下启用它：<code>/autofix-pr</code> 推断当前分支的开放 PR 并在一个步骤中为其启用 Claude Code on the web 上的自动修复。推送您的分支，运行命令，然后离开；Claude 监视 CI 和审查评论并推送修复，直到它变为绿色。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/aFXPQxiBOW99MHS3/images/whats-new/autofix-pr.mp4?fit=max&auto=format&n=aFXPQxiBOW99MHS3&q=85&s=95f191eb4711130a128aec3f6b720527" data-path="images/whats-new/autofix-pr.mp4" />
  </Frame>

  <p className="digest-feature-try">从 PR 的分支运行它：</p>

  ```text Claude Code theme={null}
  > /autofix-pr
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/claude-code-on-the-web#auto-fix-pull-requests">自动修复拉取请求</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">/team-onboarding</span>
    <span className="digest-feature-pill">v2.1.101</span>
  </div>

  <p className="digest-feature-lede">从您的本地 Claude Code 使用情况生成团队成员快速入门指南。在您熟悉的项目中运行它，并将输出交给新团队成员，以便他们可以重放您的设置，而不是从默认值开始。</p>

  <p className="digest-feature-try">在您花费了真实时间的项目中运行它：</p>

  ```text Claude Code theme={null}
  > /team-onboarding
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/commands">命令参考</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他亮点</p>

  <div className="digest-wins-grid">
    <div>焦点视图：在无闪烁模式下按 <code>Ctrl+O</code> 将视图折叠到您的最后一个提示、单行工具摘要（带有 diffstats）和 Claude 的最终响应</div>
    <div>登录屏幕上的引导式 <a href="/docs/zh-CN/docs/amazon-bedrock">Amazon Bedrock</a> 和 <a href="/docs/zh-CN/docs/google-vertex-ai">Google Cloud 的 Agent Platform</a> 设置向导：选择"第三方平台"进行分步身份验证、区域、凭证检查和模型固定</div>
    <div><code>/agents</code> 获得选项卡式布局：Running 选项卡显示带有 <code>● N running</code> 计数的实时子代理，以及库选项卡中的 Run agent 和 View running instance 操作</div>
    <div>默认工作量级别现在对 API 密钥、Amazon Bedrock、Google Cloud 的 Agent Platform、Microsoft Foundry、Team 和 Enterprise 用户为 <code>high</code>（使用 <code>/effort</code> 控制）</div>
    <div><code>/cost</code> 为订阅用户显示按模型和缓存命中的分解</div>
    <div><code>/release-notes</code> 现在是交互式版本选择器</div>
    <div>状态行：新的 <code>refreshInterval</code> 设置每 N 秒重新运行命令，JSON 输入中的 <code>workspace.git\_worktree</code></div>
    <div><code>CLAUDE\_CODE\_PERFORCE\_MODE</code>：Edit/Write 在只读文件上失败，并显示 <code>p4 edit</code> 提示，而不是静默覆盖</div>
    <div>OS CA 证书存储现在默认受信任，因此企业 TLS 代理无需额外设置即可工作（<code>CLAUDE\_CODE\_CERT\_STORE=bundled</code> 选择退出）</div>
    <div>由 Mantle 提供支持的 Amazon Bedrock：设置 <code>CLAUDE\_CODE\_USE\_MANTLE=1</code></div>
    <div>强化的 Bash 工具权限：反斜杠转义标志、环境变量前缀、<code>/dev/tcp</code> 重定向和复合命令现在正确提示</div>
    <div><code>UserPromptSubmit</code> hooks 可以通过 <code>hookSpecificOutput.sessionTitle</code> 设置会话标题</div>
  </div>
</div>

[v2.1.92–v2.1.101 的完整更改日志 →](/docs/en/changelog#2-1-92)
