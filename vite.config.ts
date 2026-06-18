import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const bridgePort = Number(process.env.BRIDGE_PORT ?? 8787);

function ignoreProxyPipeErrors(proxy: { on(event: 'error', cb: (err: NodeJS.ErrnoException) => void): void }) {
  proxy.on('error', (err) => {
    if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
    console.error('[proxy error]', err.message);
  });
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5177,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${bridgePort}`,
        changeOrigin: false,
        ws: true,
        configure: ignoreProxyPipeErrors,
      },
    },
  },
});
