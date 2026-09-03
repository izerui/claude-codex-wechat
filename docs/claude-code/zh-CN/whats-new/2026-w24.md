> ## Documentation Index
> Fetch the complete documentation index at: https://code.claude.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# 第24周 · 2026年6月8日–12日

> 使用 /cd 将会话移动到新目录，让子代理生成自己的子代理，并使用安全模式排查损坏的配置。

<div className="digest-meta">
  <span>发布版本 <a href="/docs/docs/en/changelog#2-1-166">v2.1.166 → v2.1.176</a></span>
  <span>3 项功能 · 6月8日–12日</span>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">使用 /cd 移动会话</span>
    <span className="digest-feature-pill">v2.1.169</span>
  </div>

  <p className="digest-feature-lede">新的 <code>/cd</code> 命令将当前会话移动到不同的工作目录，而无需重建提示缓存：新目录的 <code>CLAUDE.md</code> 作为消息附加，而不是替换系统提示。会话重新定位到新目录的项目存储，因此 `--resume` 和 `--continue` 会在那里找到它。如果您之前未在该目录中工作过，Claude 会提示您信任该目录。</p>

  <p className="digest-feature-try">将会话移动到另一个项目而无需重新启动：</p>

  ```text Claude Code theme={null}
  > /cd ../other-project
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/commands#all-commands">命令参考</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">子代理可以生成子代理</span>
    <span className="digest-feature-pill">v2.1.172</span>
  </div>

  <p className="digest-feature-lede">子代理现在可以生成自己的子代理。提示下方的子代理面板显示完整的树：每一行都包含其后代的计数和返回到 <code>main</code> 的路径。子代理链的深度限制为五级，以防止失控的并发树。</p>

  <p className="digest-feature-try">打开代理视图以观看嵌套树的工作展开：</p>

  ```text Claude Code theme={null}
  > /agents
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/sub-agents#spawn-nested-subagents">生成嵌套子代理</a>
</div>

<div className="digest-feature">
  <div className="digest-feature-header">
    <span className="digest-feature-title">使用安全模式排查问题</span>
    <span className="digest-feature-pill">v2.1.169</span>
  </div>

  <p className="digest-feature-lede">使用 `--safe-mode` 启动 Claude Code，或设置 <code>CLAUDE\_CODE\_SAFE\_MODE</code>，以禁用所有自定义项启动：<code>CLAUDE.md</code>、skills、plugins、hooks、MCP 服务器以及自定义命令和代理不会加载。身份验证、模型选择、内置工具和权限仍然有效。如果问题在安全模式下消失，则其中一个表面是原因。</p>

  <p className="digest-feature-try">启动干净会话以隔离损坏的配置：</p>

  ```bash terminal theme={null}
  claude --safe-mode
  ```

  <a className="digest-feature-link" href="/docs/zh-CN/docs/debug-your-config#test-against-a-clean-configuration">针对干净配置进行测试</a>
</div>

<div className="digest-wins">
  <p className="digest-wins-title">其他改进</p>

  <div className="digest-wins-grid">
    <div><a href="/docs/zh-CN/docs/model-config#fallback-model-chains"><code>fallbackModel</code></a> 配置最多三个备用模型，在主模型过载或不可用时按顺序尝试，`--fallback-model` 现在也适用于交互式会话</div>
    <div>会话标题现在以您的对话语言生成；使用 <code>language</code> 设置固定特定的标题</div>
    <div>`claude agents --json` 添加 `--all` 以包含已完成的会话以及新的 <code>id</code> 和 <code>state</code> 字段，不再省略被阻止或新分派的会话</div>
    <div>在 <code>/plugin</code> 中浏览市场的插件现在有搜索栏</div>
    <div>新的 <code>disableBundledSkills</code> 设置和 <code>CLAUDE\_CODE\_DISABLE\_BUNDLED\_SKILLS</code> 隐藏捆绑的 skills、工作流和内置命令不让模型看到</div>
    <div>拒绝规则在工具名称位置接受 glob，因此 <code>"\*"</code> 拒绝所有工具，拒绝规则中的未知工具名称现在在启动时发出警告</div>
    <div>跨会话消息传递得到加强：通过 <code>SendMessage</code> 从其他会话中继的消息不再携带用户权限，自动模式会阻止它们</div>
    <div>Amazon Bedrock 在 <code>AWS\_REGION</code> 未设置时从 <code>\~/.aws</code> 配置文件读取 AWS 区域，<code>/status</code> 显示区域来自何处</div>
    <div>新的 <code>enforceAvailableModels</code> 托管设置使 <code>availableModels</code> 允许列表也约束默认模型</div>
    <div>Chrome 浏览器工具中的 Claude 现在在单个批处理调用中加载，而不是每个工具一个</div>
    <div><code>claude update</code> 在下载前宣布目标版本，而不是保持沉默</div>
    <div>新的 <code>footerLinksRegexes</code> 设置将正则表达式匹配的链接徽章添加到页脚行</div>
  </div>
</div>

[v2.1.166–v2.1.176 的完整更新日志 →](/docs/en/changelog#2-1-166)
