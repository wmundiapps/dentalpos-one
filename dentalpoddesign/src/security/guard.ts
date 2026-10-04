import type { SecurityConfig } from './config'

/** Converte um padrão com "*" em RegExp (host: * = [a-z0-9-]+ ; origem: * em porta = dígitos). */
function globToRegExp(pattern: string, kind: 'host' | 'origin'): RegExp {
  let body = pattern.toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  if (kind === 'origin' && body.endsWith(':*')) body = body.slice(0, -2) + '(:\\d{1,5})?'
  body = body.replace(/\*/g, '[a-z0-9-]+')
  return new RegExp('^' + body + '$')
}

export function hostAllowed(hostname: string, cfg: SecurityConfig): boolean {
  const h = hostname.toLowerCase()
  return cfg.allowedHosts.some((p) => globToRegExp(p, 'host').test(h))
}

export function originAllowed(origin: string, cfg: SecurityConfig): boolean {
  let o: string
  try {
    o = new URL(origin).origin.toLowerCase()
  } catch {
    return false
  }
  return cfg.allowedParents.some((p) => globToRegExp(p, 'origin').test(o))
}

/** Origem do documento que nos embute (quando houver). */
export function parentOrigin(): string | null {
  if (window.parent === window) return null
  const anc = (location as unknown as { ancestorOrigins?: DOMStringList }).ancestorOrigins
  if (anc && anc.length > 0) return anc[0]
  try {
    if (document.referrer) return new URL(document.referrer).origin
  } catch {
    /* ignora */
  }
  try {
    // mesma origem: acessível
    return window.parent.location.origin
  } catch {
    return null
  }
}

export interface GuardResult {
  ok: boolean
  reason: 'host' | 'parent' | null
  host: string
  parent: string | null
}

/** Primeira barreira: só roda em hosts autorizados e só pode ser embutido por origens autorizadas. */
export function checkEnvironment(cfg: SecurityConfig): GuardResult {
  const host = location.hostname
  const parent = parentOrigin()
  if (!hostAllowed(host, cfg)) return { ok: false, reason: 'host', host, parent }
  if (window.parent !== window) {
    // embutido: o pai precisa ser a mesma origem ou uma origem autorizada
    const same = parent !== null && parent === location.origin
    if (!same && (parent === null || !originAllowed(parent, cfg))) return { ok: false, reason: 'parent', host, parent }
  }
  return { ok: true, reason: null, host, parent }
}
