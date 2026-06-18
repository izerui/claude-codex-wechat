import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const bridgePort = Number(process.env.BRIDGE_PORT ?? 8787);

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
      },
    },
  },
});
