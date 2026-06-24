import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { AttachFrontend } from './bootstrap';

// 生产态前端挂载：服务 Vite 构建好的静态资源，并对非 /api 路由做 SPA fallback。
export function attachStaticFrontend(webRoot: string): AttachFrontend {
  return async (app) => {
    await app.register(fastifyStatic, {
      root: webRoot,
      wildcard: false,
    });
    const indexHtml = readFileSync(join(webRoot, 'index.html'), 'utf8');
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        reply.code(404).send({ error: 'not_found' });
        return;
      }
      reply.type('text/html').send(indexHtml);
    });
  };
}
