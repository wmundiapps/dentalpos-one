import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const PILOT_BRANCH = 'chat8-5787-integracao'
const PILOT_API =
  'https://dentalpos-one-w2pa-git-chat8-57-829f80-robsonraveloliveira-7222.vercel.app/api'
const PRODUCTION_API = 'https://dentalpos-one-w2pa-one.vercel.app/api'

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

  return {
    base: '/',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        configuredApi || fallbackApi,
      ),
    },
  }
})
