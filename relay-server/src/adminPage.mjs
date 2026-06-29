export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>relay-server admin</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: #dbe2ea;
      --danger: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #f8fafc 0%, var(--bg) 100%);
      color: var(--text);
    }
    .shell {
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    .hidden { display: none !important; }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      margin-bottom: 16px;
    }
    .hero h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.1;
    }
    .button {
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      font: inherit;
    }
    .button-danger { color: var(--danger); }
    .button-link {
      background: transparent;
      border-color: transparent;
      color: var(--muted);
      padding-inline: 4px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
    }
    .login-card, .loading-card {
      max-width: 520px;
      margin: 64px auto 0;
      padding: 24px;
    }
    .loading-card {
      text-align: center;
    }
    .token-input {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
      margin-bottom: 12px;
    }
    .error {
      margin-top: 12px;
      color: var(--danger);
      font-size: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    tr:last-child td { border-bottom: 0; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      word-break: break-all;
    }
    .instance-name {
      font-weight: 600;
      margin-bottom: 4px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #166534;
      font-weight: 600;
    }
    .status::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #22c55e;
      flex: 0 0 auto;
    }
    .row-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .empty {
      padding: 28px 16px;
      text-align: center;
      color: var(--muted);
    }
    @media (max-width: 860px) {
      .hero {
        flex-direction: column;
        align-items: stretch;
      }
      table, thead, tbody, tr, th, td {
        display: block;
      }
      thead { display: none; }
      tr {
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
      }
      tr:last-child { border-bottom: 0; }
      td {
        border: 0;
        padding: 6px 0;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section id="loading-view" class="card loading-card">
      <h2 style="margin: 0 0 8px; font-size: 22px;">relay-server 管理后台</h2>
      <p style="margin: 0; color: var(--muted);">正在加载管理页面…</p>
    </section>

    <section id="login-view" class="card login-card hidden">
      <h2 style="margin: 0 0 8px; font-size: 22px;">relay-server 管理后台</h2>
      <p style="margin: 0 0 16px; color: var(--muted);">输入管理令牌后进入后台。</p>
      <input id="admin-token-input" class="token-input" type="password" placeholder="管理令牌" />
      <button id="enter-admin" class="button" type="button">进入管理</button>
      <div id="login-error" class="error hidden"></div>
    </section>

    <section id="dashboard-view" class="hidden">
      <section class="hero">
        <h1>在线连接</h1>
        <button id="change-token" class="button button-link" type="button">切换令牌</button>
      </section>
      <section class="card">
        <table>
          <thead>
            <tr>
              <th>客户端</th>
              <th>公网地址</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="connections">
            <tr><td colspan="4" class="empty">Loading…</td></tr>
          </tbody>
        </table>
      </section>
    </section>
  </main>
  <script>
    const loadingView = document.getElementById('loading-view');
    const loginView = document.getElementById('login-view');
    const dashboardView = document.getElementById('dashboard-view');
    const loginError = document.getElementById('login-error');
    const tokenInput = document.getElementById('admin-token-input');
    const enterAdminButton = document.getElementById('enter-admin');
    const changeTokenButton = document.getElementById('change-token');
    const tbody = document.getElementById('connections');
    let refreshTimer = null;

    function getStoredToken() {
      return window.localStorage.getItem('relay_admin_token') || '';
    }

    function setStoredToken(value) {
      window.localStorage.setItem('relay_admin_token', value);
    }

    function clearStoredToken() {
      window.localStorage.removeItem('relay_admin_token');
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
      }
    }

    function showLogin(errorMessage = '') {
      loadingView.classList.add('hidden');
      loginView.classList.remove('hidden');
      dashboardView.classList.add('hidden');
      if (tokenInput) tokenInput.value = getStoredToken();
      loginError.textContent = errorMessage;
      loginError.classList.toggle('hidden', !errorMessage);
    }

    function showDashboard() {
      loadingView.classList.add('hidden');
      loginView.classList.add('hidden');
      dashboardView.classList.remove('hidden');
      loginError.textContent = '';
      loginError.classList.add('hidden');
      if (!refreshTimer) {
        refreshTimer = window.setInterval(() => {
          refreshConnections().catch(() => undefined);
        }, 5000);
      }
    }

    function showLoading() {
      loadingView.classList.remove('hidden');
      loginView.classList.add('hidden');
      dashboardView.classList.add('hidden');
      loginError.textContent = '';
      loginError.classList.add('hidden');
    }

    function authorizedFetch(path, init = {}) {
      const headers = new Headers(init.headers || {});
      const adminToken = getStoredToken();
      if (adminToken) headers.set('Authorization', 'Bearer ' + adminToken);
      return fetch(path, { ...init, headers });
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    async function refreshConnections() {
      const response = await authorizedFetch('/connections');
      if (response.status === 401) throw new Error('admin_unauthorized');
      const payload = await response.json();
      const connections = Array.isArray(payload.connections) ? payload.connections : [];
      if (connections.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">当前没有在线客户端。</td></tr>';
        return;
      }
      tbody.innerHTML = connections.map((connection) => (
        '<tr>' +
          '<td><div class="instance-name">' + escapeHtml(connection.authToken || '') + '</div></td>' +
          '<td><code>' + escapeHtml(connection.publicUrl || '') + '</code></td>' +
          '<td><span class="status">在线</span></td>' +
          '<td><div class="row-actions">' +
            '<button class="button button-danger" data-auth-token="' + escapeHtml(connection.authToken || '') + '" type="button">断开连接</button>' +
          '</div></td>' +
        '</tr>'
      )).join('');

      tbody.querySelectorAll('button[data-auth-token]').forEach((button) => {
        button.addEventListener('click', async () => {
          const authToken = button.getAttribute('data-auth-token');
          if (!authToken) return;
          if (!window.confirm('确认断开这个客户端连接？')) return;
          await authorizedFetch('/connections/auth-token/' + encodeURIComponent(authToken) + '/disconnect', { method: 'POST' });
          await refreshConnections();
        });
      });
    }

    async function enterDashboard() {
      if (tokenInput && tokenInput.value) setStoredToken(tokenInput.value);
      showLoading();
      try {
        await refreshConnections();
        showDashboard();
      } catch (error) {
        if ((error.message || String(error)) === 'admin_unauthorized') {
          showLogin('管理令牌无效');
          return;
        }
        showLogin(error.message || String(error));
      }
    }

    enterAdminButton.addEventListener('click', () => {
      void enterDashboard();
    });
    tokenInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void enterDashboard();
      }
    });
    changeTokenButton.addEventListener('click', () => {
      clearStoredToken();
      showLogin();
    });

    if (getStoredToken()) {
      void enterDashboard();
    } else {
      showLogin();
    }
  </script>
</body>
</html>`;
}
