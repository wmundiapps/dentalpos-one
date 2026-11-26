import { Request } from 'express'
import { createHash } from 'crypto'
import { prisma } from '../lib/prisma'
import { dispatchRevah } from './revahProviderService'
import { writeAudit } from './auditService'

// Segurança de acessos: sessões ativas (podem ser encerradas), aviso de novo aparelho, alerta de uso estranho
// e registro de IP em acessos a dados sensíveis. Tudo "falha aberto": se a tabela de sessões ainda não existir no banco,
// o login e o sistema continuam funcionando como antes.
const SENDER = 'CompletoDonto <contato@dentalpos.com.br>'
const NEW_DEVICE_WINDOW_DAYS = 90
const ANOMALY_COOLDOWN_MS = 3600000
const TOUCH_EVERY_MS = 60000
const SENSITIVE_RE = /^\/api\/(patients?|clinical-files|clinical-documents|financial-entries|financial-alert-resolutions|receivable-charges|recurring-bills|payments?|payout-accounts|budget|users?|access-profiles|team-members?|hr|accounting|fiscal|lab-orders|laboratory-works|sales|doctor)(\/|$)/i
const EXPORT_RE = /(export|download|\.xlsx|\.csv|\.pdf)/i

const header = (req: Request, name: string) => {
  const v = req.get(name)
  if (!v) return null
  try { return decodeURIComponent(v) } catch { return v }
}

export function clientInfo(req: Request) {
  return {
    ip: req.ip || null,
    userAgent: req.get('user-agent') || null,
    city: header(req, 'x-vercel-ip-city'),
    region: header(req, 'x-vercel-ip-country-region'),
    country: header(req, 'x-vercel-ip-country'),
  }
}

export function describeDevice(ua: string | null) {
  if (!ua) return 'Aparelho desconhecido'
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'sistema desconhecido'
  return `${browser} em ${os}`
}

export const describePlace = (i: { city: string | null; region: string | null; country: string | null }) =>
  [i.city, i.region, i.country].filter(Boolean).join(', ') || 'local não identificado'

async function recipients(clinicId: string, tenantId: string, userId: string) {
  const [user, managers] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, lastName: true } }),
    prisma.user.findMany({
      where: { clinicId, tenantId, isActive: true, OR: [{ role: 'ADMIN' }, { accessProfiles: { some: { profile: { code: 'GESTOR', isActive: true } } } }] },
      select: { email: true }, take: 10,
    }),
  ])
  const to = [...new Set([user?.email, ...managers.map((m) => m.email)].filter(Boolean) as string[])]
  const name = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : 'um usuário'
  return { to, name }
}

export async function notifySecurity(clinicId: string, tenantId: string, userId: string, subject: string, body: (name: string) => string) {
  try {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim()
    if (!apiKey) return
    const { to, name } = await recipients(clinicId, tenantId, userId)
    for (const address of to) await dispatchRevah('EMAIL', address, body(name), { apiKey, subject }, SENDER).catch((e: unknown) => console.error('Aviso de segurança falhou:', e))
  } catch (e) { console.error('Aviso de segurança falhou:', e) }
}

// Aparelho/rede nunca vistos nos últimos 90 dias (e a pessoa já tinha logins antes) = aviso por e-mail.
export async function checkNewDevice(user: { id: string; clinicId: string; tenantId: string }, req: Request) {
  try {
    const info = clientInfo(req)
    const since = new Date(Date.now() - NEW_DEVICE_WINDOW_DAYS * 86400000)
    const [known, any] = await Promise.all([
      prisma.auditLog.count({ where: { actorId: user.id, module: 'auth', action: 'LOGIN', createdAt: { gte: since }, OR: [{ ipAddress: info.ip || '' }, { userAgent: info.userAgent || '' }] } }),
      prisma.auditLog.count({ where: { actorId: user.id, module: 'auth', action: 'LOGIN' } }),
    ])
    if (known > 0 || any === 0) return
    await writeAudit({ clinicId: user.clinicId, tenantId: user.tenantId, actorId: user.id, module: 'auth', action: 'LOGIN_NEW_DEVICE', entityType: 'User', entityId: user.id, summary: `Login de aparelho ou rede novos: ${describeDevice(info.userAgent)} (${describePlace(info)}).`, ipAddress: info.ip || undefined, userAgent: info.userAgent || undefined })
    await notifySecurity(user.clinicId, user.tenantId, user.id, 'Novo acesso ao CompletoDonto', (name) =>
      `Acesso de um aparelho ou rede novos na conta de ${name}.\n\nQuando: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\nAparelho: ${describeDevice(info.userAgent)}\nLocal aproximado: ${describePlace(info)}\nIP: ${info.ip || 'não identificado'}\n\nSe foi você, pode ignorar. Se não foi, entre em Configurações > Sessões ativas e encerre a sessão, depois troque a senha e ative a verificação em 2 etapas.\n\nObservação: o local é aproximado, calculado pelo IP, e pode apontar para a operadora.`)
  } catch (e) { console.warn('Falha ao checar novo aparelho:', e) }
}

export async function createSession(user: { id: string; clinicId: string; tenantId: string }, req: Request): Promise<string | undefined> {
  try {
    const info = clientInfo(req)
    const row = await prisma.userSession.create({ data: { userId: user.id, clinicId: user.clinicId, tenantId: user.tenantId, ip: info.ip, lastIp: info.ip, userAgent: info.userAgent, city: info.city, region: info.region, country: info.country } })
    return row.id
  } catch (e) { console.warn('Sessão não registrada (tabela ainda não criada?):', e instanceof Error ? e.message : e); return undefined }
}

const cache = new Map<string, { revoked: boolean; at: number }>()
const touched = new Map<string, number>()
const uaHash = (ua: string | null) => createHash('sha1').update(ua || '').digest('hex')

// Chamado em toda requisição autenticada que traz o identificador da sessão. Devolve true se a sessão foi encerrada.
export async function sessionRevoked(sid: string, req: Request, userId: string): Promise<boolean> {
  const now = Date.now()
  const hit = cache.get(sid)
  if (hit && now - hit.at < 20000) return hit.revoked
  try {
    const s = await prisma.userSession.findUnique({ where: { id: sid } })
    if (!s) { cache.set(sid, { revoked: false, at: now }); return false }
    const revoked = Boolean(s.revokedAt)
    cache.set(sid, { revoked, at: now })
    if (revoked) return true
    const info = clientInfo(req)
    const countryChanged = Boolean(s.country && info.country && s.country !== info.country)
    const browserChanged = Boolean(s.userAgent && info.userAgent && uaHash(s.userAgent) !== uaHash(info.userAgent))
    const ipChanged = Boolean(info.ip && s.lastIp && info.ip !== s.lastIp)
    const suspicious = countryChanged || (browserChanged && ipChanged)
    if (suspicious && (!s.anomalyAt || now - s.anomalyAt.getTime() > ANOMALY_COOLDOWN_MS)) {
      await prisma.userSession.update({ where: { id: sid }, data: { anomalyAt: new Date(), lastIp: info.ip, lastSeenAt: new Date() } })
      await writeAudit({ clinicId: s.clinicId, tenantId: s.tenantId, actorId: userId, module: 'auth', action: 'SESSION_ANOMALY', entityType: 'User', entityId: userId, summary: `Uso estranho da sessão: ${countryChanged ? 'país diferente' : 'navegador e rede diferentes'} (${describeDevice(info.userAgent)}, ${describePlace(info)}).`, ipAddress: info.ip || undefined, userAgent: info.userAgent || undefined }).catch(() => undefined)
      void notifySecurity(s.clinicId, s.tenantId, userId, 'Alerta: uso estranho de uma sessão', (name) =>
        `A sessão de ${name} foi usada de um lugar ou aparelho diferente do login.\n\nLogin: ${describeDevice(s.userAgent)} (${describePlace(s)}), IP ${s.ip || 'n/d'}\nAgora: ${describeDevice(info.userAgent)} (${describePlace(info)}), IP ${info.ip || 'n/d'}\n\nSe não foi você ou a pessoa, entre em Configurações > Sessões ativas e encerre a sessão agora, depois troque a senha. Local aproximado, calculado pelo IP.`)
    } else if (now - (touched.get(sid) || 0) > TOUCH_EVERY_MS) {
      touched.set(sid, now)
      void prisma.userSession.update({ where: { id: sid }, data: { lastSeenAt: new Date(), lastIp: info.ip } }).catch(() => undefined)
    }
    return false
  } catch { return false }
}

export function forgetSession(sid: string) { cache.delete(sid) }

const accessSeen = new Map<string, number>()

// Registra no log de auditoria quem acessou dados sensíveis, de qual IP (uma vez a cada 10 minutos por pessoa, módulo e IP; exportações sempre).
export function logSensitiveAccess(req: Request, user: { id: string; clinicId: string; tenantId: string }) {
  try {
    if (req.method !== 'GET') return
    const url = req.originalUrl || ''
    const m = SENSITIVE_RE.exec(url.split('?')[0])
    if (!m) return
    const isExport = EXPORT_RE.test(url)
    const key = `${user.id}|${m[1].toLowerCase()}|${req.ip}`
    const now = Date.now()
    if (!isExport && now - (accessSeen.get(key) || 0) < 600000) return
    accessSeen.set(key, now)
    if (accessSeen.size > 5000) accessSeen.clear()
    const info = clientInfo(req)
    void writeAudit({ clinicId: user.clinicId, tenantId: user.tenantId, actorId: user.id, module: 'security', action: isExport ? 'DATA_EXPORT' : 'DATA_ACCESS', entityType: m[1].toLowerCase(), summary: `${isExport ? 'Exportação' : 'Acesso'} a dados de "${m[1].toLowerCase()}" (${describeDevice(info.userAgent)}, ${describePlace(info)}).`, metadata: { path: url.split('?')[0].slice(0, 160) }, ipAddress: info.ip || undefined, userAgent: info.userAgent || undefined }).catch(() => undefined)
  } catch { /* o registro nunca atrapalha o uso */ }
}
