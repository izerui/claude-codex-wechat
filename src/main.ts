import middie from '@fastify/middie';
import { createServer as createViteServer } from 'vite';
import { startDaemon } from './daemon/bootstrap';

// 开发入口：用 tsx 直接运行，前端以 Vite middleware 模式内嵌，支持 HMR。
// 生产入口见 src/cli.ts（用 @fastify/static 服务构建产物，不启动 Vite）。
await startDaemon({
  enableUpdateCheck: true,
  attachFrontend: async (app) => {
    // /api/* 由 Fastify 路由处理，其余请求（页面、模块、HMR）交给 Vite。
    // HMR websocket 复用 Fastify 的 HTTP server，避免额外端口、确保局域网访问可热更新。
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: app.server } },
      appType: 'spa',
    });
    await app.register(middie);
    app.use((req, res, next) => {
      if (req.url?.startsWith('/api')) return next();
      vite.middlewares(req, res, next);
    });
    app.addHook('onClose', async () => {
      await vite.close();
    });
  },
});
