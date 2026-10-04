import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { allowedCorsOrigins } from '../../config/runtime'
import { deveRegistrarComLimite, eventoDeRequisicao } from './eventos'

// ============================================================
// Barreira de origem ("não rodar em outro site") + cabeçalhos de segurança da API.
// A allowlist é a MESMA do CORS: CORS_ORIGIN (allowedCorsOrigins) + origens confiáveis fixas do
// DentalPos + ALLOWED_ORIGINS (extra, separado por vírgula) + APP_ALLOWED_HOSTS (hosts, https/http) + PUBLIC_APP_URL.
// ============================================================

export const trustedDentalPosVercelOrigins = new Set([
  'https://dentalpos-one.vercel.app',
  'https://dentalpos-one-git-chat8-5787-in-e16b45-robsonraveloliveira-7222.vercel.app',
  'https://dentalpos-landing.vercel.app',
  'https://one.dentalpos.com.br',
  'http://one.dentalpos.com.br',
])

export function isTrustedDentalPosVercelOrigin(origin: string) {
  return trustedDentalPosVercelOrigins.has(origin)
}

const lista = (v: string | undefined) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean)

function normOrigem(o: string): string {
  try { return new URL(o).origin } catch { return o.replace(/\/+$/, '') }
}

/** Conjunto de origens permitidas, recalculado a cada chamada (barato) para respeitar mudanças de ambiente em testes. */
export function origensPermitidas(): Set<string> {
  const set = new Set<string>()
  for (const o of allowedCorsOrigins()) set.add(normOrigem(o))
  for (const o of trustedDentalPosVercelOrigins) set.add(o)
  for (const o of lista(process.env.ALLOWED_ORIGINS)) set.add(normOrigem(o))
  for (const h of lista(process.env.APP_ALLOWED_HOSTS)) {
    const host = h.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
    if (host) { set.add(`https://${host}`); set.add(`http://${host}`) }
  }
  const pub = String(process.env.PUBLIC_APP_URL || '').trim()
  if (pub) set.add(normOrigem(pub))
  return set
}

/** Mesma regra do CORS atual: em desenvolvimento sem nenhuma origem configurada, tudo é permitido. */
export function origemPermitida(origin: string): boolean {
  if (origemPermitidaSet(origin)) return true
  if (process.env.NODE_ENV !== 'production' && allowedCorsOrigins().length === 0) return true
  return false
}

function origemPermitidaSet(origin: string) {
  return origensPermitidas().has(normOrigem(origin)) || origensPermitidas().has(origin)
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Para métodos que alteram estado: se vier Origin (ou Referer) fora da allowlist, responde 403 e registra SegEvento.
 * Sem Origin/Referer (webhooks, cron com Bearer CRON_SECRET, servidores, curl) continua permitido.
 */
export const originGuard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (METODOS_SEGUROS.has(req.method)) return next()
  const origin = req.get('origin')
  let alvo = origin
  if (!alvo) {
    const ref = req.get('referer')
    if (ref) { try { alvo = new URL(ref).origin } catch { alvo = 'referer-invalido' } }
  }
  if (!alvo) return next()
  // Mesma origem do próprio servidor (ex.: frontend servido pelo mesmo host) é sempre aceita.
  try {
    const u = new URL(alvo)
    if (u.host && u.host === req.get('host')) return next()
  } catch { /* origem malformada ("null") cai na verificação abaixo */ }
  if (origemPermitida(alvo)) return next()

  if (deveRegistrarComLimite(`origem:${req.ip}:${alvo}`)) {
    void eventoDeRequisicao(req, { tipo: 'origem_negada', severidade: 'ATENCAO', detalhe: { origem: alvo, metodo: req.method, rota: req.path.slice(0, 120) } })
  }
  // Mesma mensagem do CORS atual para não alterar o contrato esperado pelo frontend.
  return res.status(403).json({ error: 'Origem não autorizada pelo CORS.' })
}

/** Cabeçalhos extras para /api. A CSP restritiva vai apenas em respostas JSON (não afeta download de arquivos). */
export const apiSecurityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  const json = res.json.bind(res)
  res.json = (body?: any) => {
    if (!res.headersSent) res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    return json(body)
  }
  next()
}
