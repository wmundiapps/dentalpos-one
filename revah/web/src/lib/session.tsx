import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { API_URL, get, onUnauthorized, readStoredSession, writeStoredSession } from './api'
import type { Session } from './types'

const EMBED_KEY = 'revah.embed'
// /auth/me tem limite de requisições na API: ao abrir o painel, atualiza no máximo a cada 3 min.
const ME_KEY = 'revah.meAt'
const ME_INTERVAL = 3 * 60_000

function lastMeAt() {
  try {
    return Number(sessionStorage.getItem(ME_KEY) || 0)
  } catch {
    return 0
  }
}
function markMe() {
  try {
    sessionStorage.setItem(ME_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

function loadSession(): Session | null {
  const raw = readStoredSession()
  if (!raw) return null
  try {
    const s = JSON.parse(raw)
    return s?.token ? (s as Session) : null
  } catch {
    return null
  }
}

// ?embed=1 força o modo compacto (aberto dentro do DentalPos One) nesta aba.
function readEmbedFlag() {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('embed') === '1') sessionStorage.setItem(EMBED_KEY, '1')
    if (q.get('embed') === '0') sessionStorage.removeItem(EMBED_KEY)
    return sessionStorage.getItem(EMBED_KEY) === '1'
  } catch {
    return new URLSearchParams(window.location.search).get('embed') === '1'
  }
}

function inIframe() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

// Token vindo do site revah.com.br (RevahSite.openApp): #token=... no fragmento da URL.
function takeHashToken(): string | null {
  const m = /[#&]token=([^&]+)/.exec(window.location.hash || '')
  if (!m) return null
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return decodeURIComponent(m[1])
}

interface SessionCtx {
  session: Session | null
  setSession: (s: Session | null) => void
  logout: () => void
  refresh: () => Promise<void>
  embedded: boolean
  productName: string
  canManage: boolean
}

const Ctx = createContext<SessionCtx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(loadSession)
  const [embedFlag] = useState(readEmbedFlag)
  const [hashToken] = useState(takeHashToken)
  const [bootstrapping, setBootstrapping] = useState(Boolean(hashToken))

  const setSession = useCallback((s: Session | null) => {
    writeStoredSession(s ? JSON.stringify(s) : null)
    setSessionState(s)
  }, [])

  const logout = useCallback(() => setSession(null), [setSession])

  const refresh = useCallback(async () => {
    const current = loadSession()
    if (!current) return
    const fresh = await get<Session>('/auth/me')
    markMe()
    // /auth/me gera um token novo sem a marca "embutido": preserva o modo da sessão original.
    setSession({ ...fresh, token: current.token, embedded: current.embedded || fresh.embedded })
  }, [setSession])

  useEffect(() => {
    onUnauthorized(() => setSession(null))
  }, [setSession])

  useEffect(() => {
    if (!hashToken) return
    fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${hashToken}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((fresh: Session | null) => {
        if (fresh) {
          markMe()
          setSession({ ...fresh, token: hashToken })
        }
      })
      .catch(() => null)
      .finally(() => setBootstrapping(false))
  }, [hashToken, setSession])

  // Atualiza plano/teste ao abrir o painel.
  useEffect(() => {
    if (session && Date.now() - lastMeAt() > ME_INTERVAL) refresh().catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const embedded = Boolean(session?.embedded || embedFlag || (inIframe() && session?.tenant.source === 'DENTALPOS'))
  const productName = embedded ? 'Marketing' : 'REVAH'

  useEffect(() => {
    document.title = embedded ? 'Marketing' : 'REVAH — Painel'
  }, [embedded])

  const value = useMemo<SessionCtx>(
    () => ({
      session,
      setSession,
      logout,
      refresh,
      embedded,
      productName,
      canManage: session?.user.role === 'OWNER' || session?.user.role === 'ADMIN',
    }),
    [session, setSession, logout, refresh, embedded, productName],
  )
  if (bootstrapping) return null
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const c = useContext(Ctx)
  if (!c) throw new Error('SessionProvider ausente')
  return c
}

// Sessão garantida (usar só dentro das rotas autenticadas).
export function useAuthed() {
  const c = useSession()
  if (!c.session) throw new Error('Sem sessão')
  return { ...c, session: c.session }
}
