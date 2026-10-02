import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base relativa: o app pode ser servido na raiz (produto avulso) ou dentro de
// /dentalpoddesign/ (integrado ao Dentalpos One) sem reconfigurar.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2500 },
})
