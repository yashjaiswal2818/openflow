import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The engine runs as a separate localhost process. In development and in the
// hosted preview the browser talks to Vite on the same origin, and Vite proxies
// /api to the engine. That keeps the frontend origin-relative (no hardcoded
// 127.0.0.1 in the browser) and avoids CORS entirely.
const engineTarget = process.env.OPENFLOW_ENGINE_URL || 'http://127.0.0.1:18488';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 1420,
    strictPort: true,
    // Preview hosts (e.g. *.e2b.app) are proxied in front of the dev server.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: engineTarget,
        changeOrigin: false,
        ws: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 1420,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: engineTarget,
        changeOrigin: false,
      },
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
