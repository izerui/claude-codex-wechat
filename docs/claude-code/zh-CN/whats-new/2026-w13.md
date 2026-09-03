> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第13周 · 2026年3月23–27日

> 自动模式用于免提权限、内置计算机使用、云端PR自动修复、转录搜索和Windows PowerShell工具。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-83">v2.1.83 → v2.1.85</a></span>
  <span>6项功能 · 3月23–27日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">自动模式</span>
    <span className="digest-feature-pill">研究预览</span>
  </div>

  <p className="digest-feature-lede">自动模式将您的权限提示交给分类器处理。安全的编辑和命令无需中断即可运行；任何破坏性或可疑的操作都会被阻止并显示。这是批准每个文件写入和使用 <code>--dangerously-skip-permissions</code> 运行之间的折中方案。</p>

  <Frame>
    <img src="https://mintcdn.com/claude-code/CfffsX01JHFnIKvD/images/whats-new/auto-mode.png?fit=max&auto=format&n=CfffsX01JHFnIKvD&q=85&s=367c9e9d4ba5bc57ec4b935154bf1fbb" alt="Claude Code 提示页脚显示黄色的'自动模式开启（Shift+Tab切换）'指示器" width="2400" height="691" data-path="images/whats-new/auto-mode.png" />
  </Frame>

  <p className="digest-feature-try">使用 Shift+Tab 切换到自动模式，或将其设置为默认值：</p>

  ```json ~/.claude/settings.json {3} theme={null}
  {
    "permissions": {
      "defaultMode": "auto"
    }
  }
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/permission-modes">权限模式指南</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">计算机使用</span>
    <span className="digest-feature-pill">Desktop</span>
  </div>

  <p className="digest-feature-lede">Claude 现在可以从 Claude Code Desktop 应用控制您的实际桌面：打开原生应用、点击 iOS 模拟器、驱动硬件控制面板，并验证屏幕上的更改。默认情况下它是关闭的，每次操作前都会询问。最适合用于其他方法无法到达的事情：没有 API 的应用、专有工具、任何仅作为 GUI 存在的东西。</p>

  <Frame>
    <img src="https://mintcdn.com/claude-code/CfffsX01JHFnIKvD/images/whats-new/computer-use.png?fit=max&auto=format&n=CfffsX01JHFnIKvD&q=85&s=d631de2017edafff463505f8ddbc0f51" alt="Claude Desktop 设置，计算机使用切换已启用，显示允许 Claude 在您允许的应用中截屏和控制键盘和鼠标的选项" width="2376" height="1210" data-path="images/whats-new/computer-use.png" />
  </Frame>

  <p className="digest-feature-try">在设置中启用它，授予操作系统权限，然后要求 Claude 端到端验证更改：</p>

  ```text Claude Code theme={null}
  > Open the iOS simulator, tap through the onboarding flow, and screenshot each step
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/desktop#let-claude-use-your-computer">计算机使用指南</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">PR 自动修复</span>
    <span className="digest-feature-pill">Web</span>
  </div>

  <p className="digest-feature-lede">打开 PR 时切换开关然后离开。Claude 监视 CI，修复失败，处理细节，并推送直到通过。不再需要通过六轮 lint 错误来照看 PR。</p>

  <Frame>
    <img src="https://mintcdn.com/claude-code/CfffsX01JHFnIKvD/images/whats-new/auto-fix.png?fit=max&auto=format&n=CfffsX01JHFnIKvD&q=85&s=c62b181c6c5d96929f0b43525f9f3584" alt="Claude Code web CI 面板显示自动修复切换已启用，描述为'主动修复 CI 失败和审查评论'" width="960" height="444" data-path="images/whats-new/auto-fix.png" />
  </Frame>

  <p className="digest-feature-try">在 Claude Code web 上创建 PR 后，在 CI 面板中切换自动修复。</p>

  <a className="digest-feature-link" href="/docs/zh-CN/docs/claude-code-on-the-web#auto-fix-pull-requests">自动修复拉取请求</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">转录搜索</span>
    <span className="digest-feature-pill">v2.1.83</span>
  </div>

  <p className="digest-feature-lede">在转录模式中按 <code>/</code> 搜索您的对话。<code>n</code> 和 <code>N</code> 逐步浏览匹配项。最后有办法找到 Claude 在 400 条消息前运行的那个 Bash 命令。</p>

  <p className="digest-feature-try">打开转录模式并搜索：</p>

  ```text Claude Code theme={null}
  Ctrl+O    # open transcript
  /migrate  # search for "migrate"
  n         # next match
  N         # previous match
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/fullscreen#search-and-review-the-conversation">全屏指南</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">PowerShell 工具</span>
    <span className="digest-feature-pill">预览</span>
    <span className="digest-feature-pill">v2.1.84</span>
  </div>

  <p className="digest-feature-lede">Windows 获得了与 Bash 并行的原生 PowerShell 工具。Claude 可以运行 cmdlet、管道对象，并使用 Windows 原生路径，无需通过 Git Bash 翻译所有内容。</p>

  <p className="digest-feature-try">从设置中选择加入：</p>

  ```json .claude/settings.json {3} theme={null}
  {
    "env": {
      "CLAUDE_CODE_USE_POWERSHELL_TOOL": "1"
    }
  }
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/tools-reference#powershell-tool">PowerShell 工具文档</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">条件 hooks</span>
    <span className="digest-feature-pill">v2.1.85</span>
  </div>

  <p className="digest-feature-lede">Hooks 现在可以使用权限规则语法声明 <code>if</code> 字段。您的 pre-commit 检查仅针对 <code>Bash(git commit \*)</code> 生成，而不是每个 bash 调用，减少繁忙会话中的进程开销。</p>

  <p className="digest-feature-try">将 hook 限制为仅 git 提交：</p>

  ```json .claude/settings.json {5} theme={null}
  {
    "hooks": {
      "PreToolUse": [{
        "hooks": [{
          "if": "Bash(git commit *)",
          "type": "command",
          "command": ".claude/hooks/lint-staged.sh"
        }]
      }]
    }
  }
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/hooks">Hooks 参考</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他亮点</p>

  <div className="digest-wins-grid">
    <div>Plugin <code>userConfig</code> 现已公开：在启用时提示设置，钥匙串支持的密钥</div>
    <div>粘贴的图像插入 <code>\[Image #N]</code> 芯片，您可以按位置引用</div>
    <div><code>managed-settings.d/</code> 分层策略片段的 drop-in 目录</div>
    <div><code>CwdChanged</code> 和 <code>FileChanged</code> hook 事件用于 direnv 风格的设置</div>
    <div>Agents 可以在 frontmatter 中声明 <code>initialPrompt</code> 以自动提交第一轮</div>
    <div><code>Ctrl+X Ctrl+E</code> 打开您的外部编辑器，匹配 readline</div>
    <div>在任何响应前中断会自动恢复您的输入</div>
    <div><code>/status</code> 现在在 Claude 响应时也能工作</div>
    <div>深层链接在您首选的终端中打开，而不是首次检测到的</div>
    <div>离开 75+ 分钟后的空闲返回提示到 <code>/clear</code></div>
    <div>VS Code：速率限制横幅，Esc 两次倒带选择器</div>
  </div>
</div>

[v2.1.83–v2.1.85 完整更新日志 →](/docs/en/changelog#2-1-83)
