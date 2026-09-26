import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite server proxies the API and WebSocket to the Node server,
// so the app always talks to its own origin (same as in production behind Caddy).
const target = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 900 },
  server: {
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target: target.replace(/^http/, 'ws'), ws: true },
    },
  },
});
