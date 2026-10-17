import path from 'node:path';

const rootDir = import.meta.dirname;
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const SERVER_PORT = process.env.SPOTLE_SERVER_PORT ?? '3001';
const serverOrigin = `http://localhost:${SERVER_PORT}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Single source of truth for game types, shared with the server.
      '@shared': path.resolve(rootDir, '../shared'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Allow importing ../shared and ../Assets from outside the Vite root.
    fs: { allow: [path.resolve(rootDir, '..')] },
    proxy: {
      '/api': { target: serverOrigin, changeOrigin: true },
      '/socket.io': { target: serverOrigin, ws: true, changeOrigin: true },
    },
  },
});
