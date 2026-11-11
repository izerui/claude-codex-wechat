# Spec · relay-server 接入指南页美化

## 项目是什么
claude-codex-wechat 的公网中转服务（relay-server）根路径 `/` 的接入指南页。用户在本机装一个桥接程序，用微信驱动自己电脑上的 Claude Code / Codex 会话。页面告诉新用户：准备 → 安装 → 启动 → 扫码绑定 → 开始使用，以及更新、卸载、隐私承诺。

## 受众与场景
- 中文开发者，多数是第一次听说这个工具，从链接点进来；桌面浏览器为主，也有手机微信里打开的（375 宽）。
- 核心动作：看懂 → 复制命令 → 粘到终端。命令的可读、可复制是第一优先级。

## 核心信息（全部保留，文案逐字不改）
以 `design-demos/current.html` 为准，所有文案、命令、提示原样保留，包括：
- 标题「claude-codex-wechat 接入指南」与导语
- 0 准备（Node.js ≥ 20；claude / codex 命令行）
- 1 安装 `npm install -g claude-codex-wechat --registry=https://registry.npmmirror.com/`
- 2 启动 `claude-codex-wechat start`，status 提示
- 3 扫码绑定 `http://127.0.0.1:8787`
- 4 开始使用（三条）
- 更新：`claude-codex-wechat upgrade`，旧版本降级两条命令
- 卸载：`claude-codex-wechat uninstall` + `npm uninstall -g claude-codex-wechat`；数据目录删除分 macOS/Linux（`rm -rf ~/.claude-codex-wechat`）与 Windows PowerShell（`Remove-Item -Recurse -Force "$env:USERPROFILE\.claude-codex-wechat"`）
- 隐私与安全承诺三条 + 对入侵者的法律警示（含刑法第二百八十五、二百八十六条）
- 页脚：doctor 自检提示 + 「当前在线 <strong>N</strong> 个客户端」（demo 里 N 写 3；这段 HTML 结构 `当前在线 <strong>N</strong> 个客户端` 必须原样保留，测试依赖）

## 情感基调
可信、利落、有一点玩味。这个产品的本质是「几个 AI agent 替你在你的电脑上干活」，页面载入时由几个协作光标（标签如 Claude、Codex、微信）把页面一块块搭出来——这是本次的灵感来源（swarm-cursors / Joel Califa 的 Swarm：十字准星拖出框并显示 W×H、I-beam 打字带闪烁光标、标尺参考线吸附、⌥ 拖拽复制出重复块）。
**版权：这两个项目都没有开源许可，只借概念，动画代码必须完全自己写，不得抄任何代码。**

## 输出格式与尺寸（三版统一）
- 单文件 HTML：`design-demos/dir-N.html`，内联 CSS + 原生 JS，零外部依赖（不加载任何外部字体/CDN/图片；字体用系统字体栈）。
- 最终会被塞进一个 JS 模板字符串，所以：不要用反引号 `` ` ``，不要出现 `${`（PowerShell 那条里的 `$env:` 没问题）；反斜杠尽量避免（Windows 路径那一处除外）。
- 验证宽度 1440×900 与 375×812。

## 硬约束
- 每个命令块保留「复制」按钮，点击复制 `<pre>` 文本并显示「已复制」（可沿用 current.html 的脚本思路，自己写也行）。可点元素 ≥44×44（移动端）。
- 搭建动画：
  - 总时长 4–7 秒，载入即播；提供「跳过」按钮；点击/按 Esc 也可跳过。
  - `prefers-reduced-motion: reduce` 时直接显示最终页面，不播。
  - **渐进增强**：内容默认可见；只有 JS 运行后才加类把内容隐藏再搭建。JS 失败页面必须完整可读。
  - 动画结束后光标淡出或退到不挡内容的位置，页面完全可交互、可选中、可复制；不残留覆盖层拦截点击。
  - 首屏优先搭建，下面的区块可以在滚动进入时再搭（IntersectionObserver），或者整体快速搭完——自己判断，但不能让用户等很久才看到命令。
- 正文 ≥14px（移动 16px），标签 ≥12px，正文对比度 ≥4.5:1。
- 控制台零报错。
- 不加编造的数据、评价、logo 墙；不加 emoji 图标装饰（现有 🔒 ⚠️ 可以去掉或保留，自己判断）。
- 避开最近交付过的「近黑底 + system-ui 无衬线」组合（外观账本），除非方向卡明确需要。
