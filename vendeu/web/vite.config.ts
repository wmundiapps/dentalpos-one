import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(__dirname, '../shared') } },
  build: { sourcemap: false },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:4100' },
  },
});
