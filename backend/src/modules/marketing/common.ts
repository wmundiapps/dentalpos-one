import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, getTenantId, getUserId } from '../academico/middleware'
import { hmacCurto, mascararEmail, mascararTelefone } from '../lgpd/mascara'

export const MOD = 'marketing'
export const db = prisma as any

// Papéis: ADMIN/OWNER/RECTOR/BOARD sempre (requireRole). Marketing escreve; admissões/coordenação/secretaria leem e atuam em leads.
export const GESTAO: AcademicRole[] = ['MARKETING']
export const LEITURA: AcademicRole[] = ['MARKETING', 'ADMISSIONS', 'COORDINATOR', 'SECRETARY', 'FINANCE']
export const ATENDE: AcademicRole[] = ['MARKETING', 'ADMISSIONS', 'SECRETARY']
export const APROVA: AcademicRole[] = ['COORDINATOR'] // além dos super-papéis

export const tid = (req: AuthenticatedRequest) => getTenantId(req)
export const uid = (req: AuthenticatedRequest) => getUserId(req)

export function fail(status: number, msg: string): never {
  throw Object.assign(new Error(msg), { status })
}

export const ORIGENS = [
  'SITE', 'INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'THREADS', 'GOOGLE_ADS', 'TWILIO_LIGACAO', 'WHATSAPP', 'EMAIL',
  'RADIO', 'TV', 'OUTDOOR', 'PANFLETAGEM', 'CONVENIO_EMPRESA', 'CONVENIO_COLEGIO', 'CONVENIO_PREFEITURA', 'INDICACAO', 'EVENTO', 'BALCAO', 'OUTRO',
] as const
export const CANAIS_DISPARO = ['EMAIL', 'SMS', 'TELEGRAM', 'WHATSAPP', 'VOZ'] as const
export const REDES = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK', 'THREADS'] as const
export const OFFLINE_TIPOS = ['RADIO', 'TV', 'OUTDOOR', 'PANFLETAGEM', 'JORNAL', 'EVENTO_PRESENCIAL', 'CARRO_DE_SOM', 'OUTRO'] as const
export const ETAPAS = ['NOVO', 'CONTATO', 'QUALIFICADO', 'INSCRITO', 'MATRICULADO', 'PERDIDO'] as const

export const optStr = (max = 2000) => z.preprocess((v) => (v === '' ? undefined : v), z.string().max(max).nullish())
export const dt = () => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.date().optional())
export const dtReq = () => z.coerce.date()
export const money = () => z.number().finite().min(0).max(1e12)

export const sha = (s: string) => createHash('sha256').update(s).digest('hex')
export const token = (bytes = 12) => randomBytes(bytes).toString('hex')
export const normEmail = (e?: string | null) => { const v = String(e ?? '').trim().toLowerCase(); return /^\S+@\S+\.\S+$/.test(v) ? v : null }
export function normFone(t?: string | null): string | null {
  const d = String(t ?? '').replace(/\D+/g, '')
  if (d.length < 10 || d.length > 13) return null
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`
}
export const hashId = (tenantId: string, tipo: string, valor: string) => hmacCurto(`mkt:${tipo}:${valor.toLowerCase()}`, tenantId, 40)
export const mask = (tipo: string, v: string) => (tipo === 'EMAIL' ? mascararEmail(v) : tipo === 'TELEFONE' ? mascararTelefone(v) : v.length > 6 ? v.slice(0, 2) + '***' + v.slice(-2) : '***')

export async function getConfig(tenantId: string) {
  const ex = await db.mktConfig.findUnique({ where: { tenantId } })
  if (ex) return ex
  try { return await db.mktConfig.create({ data: { tenantId } }) } catch (e: any) {
    if (e?.code === 'P2002') return db.mktConfig.findUnique({ where: { tenantId } })
    throw e
  }
}
export async function historico(tenantId: string, refType: string, refId: string, acao: string, userId?: string | null, nota?: string | null) {
  await db.mktHistorico.create({ data: { tenantId, refType, refId, acao, userId: userId ?? undefined, nota: nota ?? undefined } })
}
export async function marca(tenantId: string) {
  const [m, inst] = await Promise.all([db.mktMarca.findUnique({ where: { tenantId } }), prisma.eduInstitution.findUnique({ where: { tenantId } })])
  return {
    nome: m?.nome || inst?.nomeFantasia || inst?.nome || 'EduMaster',
    sigla: inst?.sigla || null,
    corPrimaria: m?.corPrimaria || inst?.corPrimaria || '#0F5FDB',
    corSecundaria: m?.corSecundaria || inst?.corSecundaria || '#0B1F3A',
    corDestaque: m?.corDestaque || inst?.corDestaque || '#21C7A8',
    tomDeVoz: m?.tomDeVoz || 'acolhedor e profissional',
    slogan: m?.slogan || inst?.lema || null,
    assinatura: m?.assinatura || null,
  }
}
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'
export const ymd = (d: Date) => d.toISOString().slice(0, 10)
export const publicBase = () => (process.env.PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '')
export const publicApi = () => (process.env.PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3000/api').replace(/\/$/, '')
export function csv(rows: Array<Record<string, any>>, cols?: string[]) {
  const keys = cols ?? Object.keys(rows[0] ?? {})
  const cell = (v: any) => { let s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [keys.join(';'), ...rows.map((r) => keys.map((k) => cell(r[k])).join(';'))].join('\n')
}
