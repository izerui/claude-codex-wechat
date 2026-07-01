export function renderLandingPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>claude-codex-wechat · 接入指南</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #dbe2ea;
      --accent: #2563eb;
      --code-bg: #0f172a;
      --code-text: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: linear-gradient(180deg, #f8fafc 0%, var(--bg) 100%);
      color: var(--text);
      line-height: 1.6;
    }
    .shell {
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 20px 72px;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.2;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      font-size: 16px;
    }
    section.step {
      margin-top: 28px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px 22px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
    }
    section.step h2 {
      margin: 0 0 6px;
      font-size: 18px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .step-index {
      flex: 0 0 auto;
      width: 26px;
      height: 26px;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    section.step p {
      margin: 8px 0;
      color: #374151;
    }
    section.step p.muted { color: var(--muted); font-size: 14px; }
    .code-block {
      position: relative;
      margin: 12px 0 4px;
    }
    pre {
      margin: 0;
      background: var(--code-bg);
      color: var(--code-text);
      border-radius: 12px;
      padding: 16px 18px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      line-height: 1.55;
    }
    .copy-button {
      position: absolute;
      top: 10px;
      right: 10px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      border-radius: 8px;
      padding: 5px 10px;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
    }
    .copy-button:hover { background: rgba(255, 255, 255, 0.2); }
    code.inline {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 13px;
      background: #f1f5f9;
      padding: 1px 6px;
      border-radius: 6px;
      word-break: break-all;
    }
    ul.tips { margin: 8px 0 0; padding-left: 20px; color: #374151; }
    ul.tips li { margin: 4px 0; }
    .footer {
      margin-top: 32px;
      text-align: center;
      color: var(--muted);
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="hero">
      <h1>claude-codex-wechat 接入指南</h1>
      <p>在本机跑一个桥接程序，就能用微信直接驱动你电脑上的 Claude Code / Codex 会话。装好、启动、扫码，即可使用，全程无需改配置。</p>
    </header>

    <section class="step">
      <h2><span class="step-index">0</span>准备</h2>
      <ul class="tips">
        <li>本机已安装 <strong>Node.js ≥ 20</strong>。</li>
        <li>已安装并登录好要用的 <code class="inline">claude</code> 或 <code class="inline">codex</code> 命令行。</li>
      </ul>
    </section>

    <section class="step">
      <h2><span class="step-index">1</span>安装</h2>
      <div class="code-block">
        <button class="copy-button" type="button">复制</button>
        <pre>npm install -g claude-codex-wechat --registry=https://registry.npmmirror.com/</pre>
      </div>
    </section>

    <section class="step">
      <h2><span class="step-index">2</span>启动</h2>
      <p>后台启动即可（首次启动会自动生成接入凭据、自动连接中转，无需任何配置）：</p>
      <div class="code-block">
        <button class="copy-button" type="button">复制</button>
        <pre>claude-codex-wechat start</pre>
      </div>
      <p class="muted">用 <code class="inline">claude-codex-wechat status</code> 可随时查看运行状态。</p>
    </section>

    <section class="step">
      <h2><span class="step-index">3</span>扫码绑定微信</h2>
      <p>启动后，在本机浏览器打开管理页，用微信扫码登录即可完成绑定：</p>
      <div class="code-block">
        <button class="copy-button" type="button">复制</button>
        <pre>http://127.0.0.1:8787</pre>
      </div>
    </section>

    <section class="step">
      <h2><span class="step-index">4</span>开始使用</h2>
      <ul class="tips">
        <li>直接在微信里给机器人发消息，像聊天一样让它在你电脑上干活——读写代码、执行命令、改文件。</li>
        <li>它跑在你自己的电脑上，用的就是你本机的 Claude / Codex 和项目文件。</li>
        <li>随时离开、稍后再发消息，都能接着上次的会话继续，不用重新开始。</li>
      </ul>
    </section>

    <p class="footer">遇到问题？先跑 <code class="inline">claude-codex-wechat doctor</code> 自检。</p>
  </main>

  <script>
    document.querySelectorAll('.copy-button').forEach(function (button) {
      button.addEventListener('click', function () {
        var pre = button.parentElement.querySelector('pre');
        if (!pre) return;
        var text = pre.textContent || '';
        var done = function () {
          var original = button.textContent;
          button.textContent = '已复制';
          window.setTimeout(function () { button.textContent = original; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () {});
        }
      });
    });
  </script>
</body>
</html>`;
}
