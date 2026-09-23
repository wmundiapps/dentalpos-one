import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Porta 5174 = APP_URL padrão da API em desenvolvimento.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: { port: 5174 },
})
