import { useSyncExternalStore } from 'react'
import { getSecurityConfig } from './config'

/**
 * Sessão do DentalPod: (1) token de host — quando `requireHostToken` está ativo, o app só libera depois
 * que o Dentalpos One entrega um token curto assinado pelo servidor e o servidor confirma;
 * (2) bloqueio por inatividade.
 */

export type LockReason = 'none' | 'token' | 'idle'
interface SessionState {
  lock: LockReason
  msg: string
}
let state: SessionState = { lock: 'none', msg: '' }
const subs = new Set<() => void>()
const set = (s: SessionState) => {
  state = s
  subs.forEach((f) => f())
}
export const sessionState = () => state
export const subscribeSession = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
export const useSession = () => useSyncExternalStore(subscribeSession, sessionState)

/** Chamado na inicialização: se exigir token, começa bloqueado até o host se identificar. */
export function initSession() {
  const cfg = getSecurityConfig()
  if (cfg.requireHostToken) set({ lock: 'token', msg: 'Abra o DentalPod Design pelo Dentalpos One para continuar.' })
  startIdleWatch()
}

export async function verifyHostToken(token: unknown): Promise<boolean> {
  const cfg = getSecurityConfig()
  if (!cfg.requireHostToken) return true
  if (typeof token !== 'string' || token.length < 20 || token.length > 2000) return false
  try {
    const r = await fetch(`${cfg.apiUrl}/dpd/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!r.ok) return false
    const j = (await r.json()) as { ok?: boolean }
    if (j.ok !== true) return false
    set({ lock: 'none', msg: '' })
    return true
  } catch {
    return false
  }
}

export function denyToken(msg = 'Sessão não autorizada. Abra o DentalPod Design pelo Dentalpos One.') {
  set({ lock: 'token', msg })
}

// ── inatividade ──
let idleTimer: ReturnType<typeof setTimeout> | null = null
function startIdleWatch() {
  const mins = getSecurityConfig().idleLockMinutes
  if (!mins) return
  const reset = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (state.lock === 'none') set({ lock: 'idle', msg: 'Sessão bloqueada por inatividade.' })
    }, mins * 60_000)
  }
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => state.lock === 'none' && reset(), { passive: true })
  reset()
}

export function unlockIdle() {
  if (state.lock === 'idle') set({ lock: 'none', msg: '' })
}
