// Bloqueio temporário por conta após falhas seguidas de login (em memória, por instância).
const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCK_MS = 15 * 60 * 1000

type Entry = { count: number; first: number; lockedUntil: number }
const entries = new Map<string, Entry>()

function prune(now: number) {
  if (entries.size < 5000) return
  for (const [k, v] of entries) {
    if (v.lockedUntil < now && now - v.first > WINDOW_MS) entries.delete(k)
  }
}

export function lockoutKey(email: string, clinicId?: string) {
  return `${clinicId || '*'}:${email}`
}

export function lockRemainingMs(key: string, now = Date.now()) {
  const e = entries.get(key)
  return e && e.lockedUntil > now ? e.lockedUntil - now : 0
}

export function registerLoginFailure(key: string, now = Date.now()) {
  prune(now)
  const e = entries.get(key)
  if (!e || now - e.first > WINDOW_MS) {
    entries.set(key, { count: 1, first: now, lockedUntil: 0 })
    return
  }
  e.count += 1
  if (e.count >= MAX_FAILURES) e.lockedUntil = now + LOCK_MS
}

export function clearLoginFailures(key: string) {
  entries.delete(key)
}
