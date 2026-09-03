> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第29周 · 2026年7月13–17日

> 通过MCP连接器将实时数据拉入已发布的工件中，并在新的屏幕阅读器模式下使用Claude Code。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-207">v2.1.207 → v2.1.212</a></span>
  <span>2项功能 · 7月13–17</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">工件调用您的MCP连接器</span>
    <span className="digest-feature-pill">web</span>
  </div>

  <p className="digest-feature-lede">已发布的工件现在可以在每次有人查看时调用MCP连接器，因此仪表板显示实时数据并可以按需执行操作，而不是构建它的会话中的快照。每次调用都通过查看者自己的连接运行，查看者在页面首次连接器调用前批准访问。本周还添加了公开共享链接、Team和Enterprise计划上的编辑者角色，以及从Claude Tag会话创建的工件。</p>

  <Frame>
    <video autoPlay muted loop playsInline className="w-full" src="https://mintcdn.com/claude-code/ItzF3QVI6L0QypjJ/images/whats-new/artifacts-mcp.mp4?fit=max&auto=format&n=ItzF3QVI6L0QypjJ&q=85&s=ff8b81ed52b26c773899dc28cec959e6" data-path="images/whats-new/artifacts-mcp.mp4" />
  </Frame>

  <p className="digest-feature-try">在您的提示中命名连接器和您想要的数据：</p>

  ```text title="Claude Code" wrap theme={null}
  Build a dashboard artifact of open pull requests that pulls the live list through my GitHub connector when the page loads.
  ```

  <a className="digest-feature-link" href="/docs/docs/zh-CN/artifacts#pull-live-data-with-mcp-connectors">使用MCP连接器拉取实时数据</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">屏幕阅读器模式</span>
    <span className="digest-feature-pill">CLI</span>
  </div>

  <p className="digest-feature-lede">屏幕阅读器模式用纯文本、线性文本替换可视化终端界面：不使用框、旋转器和原地重绘，Claude Code打印标记的行，屏幕阅读器（如VoiceOver或NVDA）按顺序读取，因此您可以批准权限并端到端审查输出。使用标志按会话打开它，使用<code>CLAUDE\_AX\_SCREEN\_READER</code>环境变量按shell打开它，或使用<code>axScreenReader</code>设置在任何地方打开它。</p>

  <p className="digest-feature-try">在屏幕阅读器模式下启动会话：</p>

  ```bash terminal theme={null}
  claude --ax-screen-reader
  ```

  <a className="digest-feature-link" href="/docs/docs/zh-CN/accessibility#turn-on-screen-reader-mode">打开屏幕阅读器模式</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他改进</p>

  <div className="digest-wins-grid">
    <div><code>/fork</code>现在将您的对话复制到新的后台会话中，在<code>claude agents</code>中有自己的行，同时您继续工作；它曾经启动的会话内分叉子代理现在是<code>/subtask</code></div>
    <div><a href="/docs/docs/zh-CN/permission-modes#enable-auto-mode-on-bedrock-agent-platform-or-foundry">自动模式</a>在Amazon Bedrock、Google Cloud的Agent Platform和Microsoft Foundry上不再需要<code>CLAUDE\_CODE\_ENABLE\_AUTO\_MODE</code>选择加入；管理员可以使用<code>disableAutoMode</code>关闭它</div>
    <div>运行时间超过两分钟的MCP工具调用现在自动移到后台，以便会话保持可用；使用<code>CLAUDE\_CODE\_MCP\_AUTO\_BACKGROUND\_MS</code>调整或禁用阈值</div>
    <div>新的<code>claude auto-mode reset</code>恢复默认自动模式配置，`--yes`跳过确认提示</div>
    <div>新的<a href="/docs/docs/zh-CN/corporate-launcher">企业启动器</a>支持：<code>CLAUDE\_CODE\_PROCESS\_WRAPPER</code>或<code>processWrapper</code>设置通过必需的包装器可执行文件运行Claude Code从其自己的二进制文件启动的进程，例如后台服务和代理视图会话</div>
    <div><code>vimInsertModeRemaps</code>设置将两键插入模式序列（如<code>jj</code>）映射到vim模式中的Escape</div>
    <div>`--forward-subagent-text`和<code>CLAUDE\_CODE\_FORWARD\_SUBAGENT\_TEXT</code>在<a href="/docs/docs/zh-CN/headless">stream-json输出</a>中包含子代理文本和思考块</div>
    <div>会话范围的上限停止失控循环：WebSearch调用和子代理生成各默认为200，可使用<code>CLAUDE\_CODE\_MAX\_WEB\_SEARCHES\_PER\_SESSION</code>和<code>CLAUDE\_CODE\_MAX\_SUBAGENTS\_PER\_SESSION</code>调整</div>
    <div>"始终允许"权限规则保存在存储库根目录，因此在git worktree中授予的批准在会话和worktree中持续</div>
    <div>Amazon Bedrock、Google Cloud的Agent Platform和AWS上的Claude Platform现在默认为Claude Opus 4.8</div>
    <div>折叠的工具摘要行显示实时经过时间计数器，因此长时间运行的工具调用可见地计时，而不是看起来卡住</div>
  </div>
</div>

[v2.1.207–v2.1.212的完整更新日志 →](/docs/en/changelog#2-1-207)
