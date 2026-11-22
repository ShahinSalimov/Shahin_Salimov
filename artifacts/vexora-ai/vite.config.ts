import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// PORT / BASE_PATH are optional so the app runs both on Replit and locally.
const port = Number(process.env.PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? '/';
// Dev/preview: forward /api to the API server (artifacts/api-server).
const apiTarget = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 8080}`;
const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: { port, host: '0.0.0.0', allowedHosts: true, proxy },
  preview: { port, host: '0.0.0.0', allowedHosts: true, proxy },
});
