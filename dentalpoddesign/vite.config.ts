import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** CSP "restritiva" injetada só no build de produção (em dev o Vite precisa de scripts inline/eval). */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function cspMeta(): Plugin {
  return {
    name: 'dpd-csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  }
}

// base relativa: o app pode ser servido na raiz (produto avulso) ou dentro de
// /dentalpoddesign/ (integrado ao Dentalpos One) sem reconfigurar.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), cspMeta()],
  esbuild: mode === 'production' ? { drop: ['console', 'debugger'] } : undefined,
  // hosts extras só para os testes de segurança (simulam um site não autorizado)
  preview: { allowedHosts: ['evil.test', 'api.test'] },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // bibliotecas de terceiros ficam fora dos chunks do app: o código próprio é o único ofuscado
        manualChunks(id: string) {
          if (id.includes('node_modules/@tensorflow') || id.includes('node_modules/nsfwjs')) return 'nsfw-vendor'
          if (id.includes('node_modules')) return 'vendor'
          return undefined
        },
      },
    },
  },
}))
