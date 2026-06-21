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
   - 开发模式（非 production）：用 `vite.createServer({ server: { middlewareMode: true }, appType: 'spa' })` 创建 Vite 实例，通过 `@fastify/middie` 把 `vite.middlewares` 注册到 Fastify，接管所有非 `/api` 请求（index.html、`/src/web/*`、HMR client、模块转换等）。
   - 生产模式：serve `dist` 静态产物，并对未命中路由做 SPA fallback 到 `dist/index.html`。
   - 进程退出时关闭 Vite 实例。

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

- **中间件顺序**：Fastify 的 `/api/*` 路由需先于 Vite middleware 命中。Fastify 路由匹配优先于 middie 注册的中间件对未匹配路径的处理，因此 `/api` 请求始终由 Fastify 路由处理；Vite 仅处理 404 之外的前端资源。
- **@fastify/middie 版本**：需选用兼容 Fastify 5 的版本（9.x）。

## 验证

- `pnpm dev` 启动后访问 `http://127.0.0.1:8787` 能打开管理页。
- 修改 `src/web/*.tsx` 浏览器内容热更新生效。
- API（如 `/api/status`）返回正常，SSE 事件流正常。
- `pnpm typecheck`、`pnpm build:web` 通过。
