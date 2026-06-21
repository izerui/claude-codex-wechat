# 合并 pnpm dev / pnpm web 为单进程启动

日期：2026-05-26

## 背景

当前开发需要启动两个进程：

- `pnpm dev` — Fastify 后端，监听 `BRIDGE_PORT`（默认 8787）
- `pnpm web` — Vite dev server，监听 5177，并将 `/api` 反向代理到后端

诉求：合并为单一 `pnpm dev`，前端与后端在同一进程内运行，访问同一端口。

## 目标

- 一条命令 `pnpm dev` 同时提供前端页面（含 HMR）与后端 API。
- 前端与 API 同源同端口（默认 8787），不再需要 `/api` 代理。
- 保留前端热更新（HMR）开发体验。
- 删除 `pnpm web` 脚本与 5177 端口。

## 方案

使用 Vite 的 middleware 模式，将 Vite 作为中间件嵌入 Fastify 进程。

### 改动点

1. **`src/main.ts`**
   - 在 `app.listen` 之前接入前端服务。
   - 用 `vite.createServer({ server: { middlewareMode: true, hmr: { server: app.server } }, appType: 'spa' })` 创建 Vite 实例，通过 `@fastify/middie` 注册一个包装中间件：`/api/*` 调用 `next()` 落到 Fastify 路由，其余请求交给 `vite.middlewares`（index.html、`/src/web/*`、HMR client、模块转换、SPA fallback）。
   - HMR websocket 通过 `hmr.server = app.server` 复用 Fastify 的 HTTP server，不再占用额外端口（避免局域网访问时 HMR 连不上）。
   - 进程退出时（`onClose`）关闭 Vite 实例。
   - 生产环境不在本进程内 serve 静态产物：本进程是开发入口（`pnpm dev`），生产前端构建仍由 `pnpm build:web` 产出 `dist`，部署方式不在本次范围内。

2. **`package.json`**
   - 删除 `web` 脚本。
   - `dev` 保持 `tsx src/main.ts`。
   - 新增依赖 `@fastify/middie`（兼容 Fastify 5）。

3. **`vite.config.ts`**
   - 删除 `server.proxy`（同进程同端口后不再需要代理 `/api`）。
   - `server.host` / `port` 在 middleware 模式下不再生效，可保留或精简；保留 `plugins`（react）与默认 `build` 配置供 middleware 与 `build:web` 复用。

4. **`README.md`**
   - 「本地启动」章节合并为单条 `pnpm dev`，删除 `pnpm web` 说明，访问地址统一为 `http://127.0.0.1:8787`。

### 不变的部分

- 所有 API 路由都在 `/api` 前缀下，Vite middleware 仅接管其余路径，无冲突。
- SSE 端点 `/api/bridge-events` 走 Fastify 原生 hijack，不受影响。
- 前端 `apiClient` 使用同源相对路径，无需改动。

## 风险与缓解

- **路由分流**：Vite 在 `appType: 'spa'` 下会对所有未命中静态资源的路径返回 `index.html`，包括 `/api/*`。因此必须在中间件里显式判断 `/api` 前缀并 `next()` 放行给 Fastify，而非依赖 Fastify 路由“自动优先”。
- **@fastify/middie 版本**：使用兼容 Fastify 5 的 9.x（实测 9.3.2）。
- **HMR 端口**：默认 middlewareMode 会另起 24678 ws 端口；通过 `hmr.server = app.server` 收敛到单端口。

## 验证（已完成）

- `pnpm dev` 单进程启动，`/api/status`、`/api/providers/status` 返回 JSON，`/` 与 `/src/web/main.tsx` 由 Vite 提供。
- HMR websocket 在主端口握手成功（101 + `vite-hmr` 子协议 + `{"type":"connected"}`），无独立 24678 端口。
- `pnpm build:web` 构建通过。
- `pnpm typecheck` 仅余既有的、与本次无关的测试文件报错（`tests/web/appInteractions.test.tsx`）。
