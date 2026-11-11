/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiPort = Number(process.env.ADSPARK_SERVER_PORT ?? 8787);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Optional AI proxy. When the server is not running, the app falls back to the local engine.
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: false,
        configure(proxy) {
          // If the optional AdSpark server is not running, answer cleanly instead of a proxy error.
          proxy.on('error', (_err, req, res) => {
            if (!('writeHead' in res) || res.headersSent) return;
            const offline = req.url?.startsWith('/api/ai/status');
            res.writeHead(offline ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(offline ? { enabled: false, reason: 'The AdSpark server is not running.' } : { error: 'The AdSpark server is not running.' }));
          });
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
