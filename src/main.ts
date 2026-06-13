import { createDaemonServer } from './daemon/server';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
const { app } = createDaemonServer();

await app.listen({ host: '127.0.0.1', port });
console.log(`local-agent-wechat-bridge listening on http://127.0.0.1:${port}`);
