import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const PILOT_BRANCH = 'chat8-5787-integracao'
const PILOT_API =
  'https://dentalpos-one-w2pa-git-chat8-57-829f80-robsonraveloliveira-7222.vercel.app/api'
const PRODUCTION_API = 'https://dentalpos-one-w2pa-one.vercel.app/api'

// No modo EduMaster (VITE_APP_MODE=edu) o index.html não menciona o produto odontológico.
function eduIndexHtml(enabled: boolean) {
  return {
    name: 'edu-index-html',
    transformIndexHtml(html: string) {
      if (!enabled) return html
      return html
        .replace(/<title>[^<]*<\/title>/, '<title>EduMaster Pro</title>')
        .replace(/content="DentalPos One[^"]*"/, 'content="EduMaster Pro — gestão acadêmica, administrativa e financeira para instituições de ensino."')
        .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" type="image/svg+xml" href="/edu-favicon.svg" />')
        .replace(/<link rel="apple-touch-icon"[^>]*>/, '<link rel="apple-touch-icon" href="/edu-favicon.svg" />')
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const configuredApi = String(
    env.VITE_API_URL || process.env.VITE_API_URL || '',
  ).trim()

  const isVercel = Boolean(process.env.VERCEL)
  const isPilotPreview =
    isVercel &&
    process.env.VERCEL_GIT_COMMIT_REF === PILOT_BRANCH

  const fallbackApi = isVercel
    ? (isPilotPreview ? PILOT_API : PRODUCTION_API)
    : 'http://localhost:3000/api'

  const isProd = mode === 'production'

  return {
    base: '/',
    plugins: [react(), eduIndexHtml(String(env.VITE_APP_MODE || process.env.VITE_APP_MODE || '').toLowerCase() === 'edu')],
    build: {
      // Produção: sem sourcemaps (não publicamos o código-fonte original) e sem comentários.
      sourcemap: false,
      ...(isProd
        ? {
            rolldownOptions: {
              output: {
                // Nomes de arquivo sem informação útil (apenas hash).
                entryFileNames: 'assets/[hash].js',
                chunkFileNames: 'assets/[hash].js',
                assetFileNames: 'assets/[hash][extname]',
                comments: false,
                // Minificação máxima; remove console.* e debugger do bundle.
                minify: {
                  compress: { dropConsole: true, dropDebugger: true },
                  mangle: true,
                  codegen: { removeWhitespace: true },
                },
              },
            },
          }
        : {}),
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        configuredApi && !configuredApi.includes('localhost') && !configuredApi.includes('127.0.0.1') ? configuredApi : fallbackApi,
      ),
    },
  }
})
