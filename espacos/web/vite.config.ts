import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false }, // o navegador recebe só o código compactado, sem os arquivos-fonte
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/api': process.env.API_URL ?? 'http://localhost:4000' },
  },
});
