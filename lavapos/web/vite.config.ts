import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false },
  server: { port: 5174, proxy: { '/api': process.env.API_URL ?? 'http://localhost:4100' } },
});
