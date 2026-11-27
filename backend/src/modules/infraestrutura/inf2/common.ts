import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../../academico/middleware'
import { audit, notify } from '../../core/notify'
import { dateISO, pageParams, parseBody, qs } from '../../core/crud'
import { fail, money } from '../util'

export { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole, audit, notify, dateISO, pageParams, parseBody, qs, fail, money, z, prisma }
export type { Request, Response }

export const MOD2 = 'infraestrutura.inf2'
/** Gestão da infraestrutura (ADMIN/OWNER/RECTOR/BOARD sempre têm acesso). */
export const GESTAO: AcademicRole[] = ['FACILITIES']
/** Leitura ampla: gestão + coordenação + financeiro/suprimentos + apoio. */
export const LEITURA: AcademicRole[] = ['FACILITIES', 'COORDINATOR', 'FINANCE', 'SUPPLIES', 'SECRETARY', 'SUPPORT', 'STAFF']
/** Pessoal operacional (porteiros, seguranças, coordenadores de sala/pátio): registram rondas, ocorrências e passagens. */
export const OPERACAO: AcademicRole[] = ['FACILITIES', 'STAFF', 'SUPPORT', 'COORDINATOR']
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const isSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role).toUpperCase())
export const isGestao = (req: AuthenticatedRequest) => isSuper(req) || String(req.user?.role).toUpperCase() === 'FACILITIES'
export const isRh = (req: AuthenticatedRequest) => isSuper(req) || String(req.user?.role).toUpperCase() === 'HR'
export const NOT_STUDENT = (req: AuthenticatedRequest, res: Response, next: () => void) => {
  if (String(req.user?.role).toUpperCase() === 'STUDENT') return res.status(403).json({ error: 'Sem permissão para esta ação.' }) as any
  next()
}

export const DAY = 86_400_000
export const addDias = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
export const diasAte = (d?: Date | null, ref = new Date()) => (d ? Math.ceil((d.getTime() - ref.getTime()) / DAY) : null)
export const faixaVenc = (dias: number | null): 'VENCIDO' | 'D30' | 'D60' | 'D90' | 'OK' | null =>
  dias === null ? null : dias < 0 ? 'VENCIDO' : dias <= 30 ? 'D30' : dias <= 60 ? 'D60' : dias <= 90 ? 'D90' : 'OK'
export const alertaVenc = (d?: Date | null) => { const dias = diasAte(d); return { dias, faixa: faixaVenc(dias) } }

export async function nextNum(tenantId: string, chave: string, prefixo: string, pad = 4): Promise<string> {
  const ano = new Date().getFullYear()
  const c = await prisma.inf2Contador.upsert({
    where: { tenantId_chave: { tenantId, chave: `${chave}-${ano}` } },
    create: { tenantId, chave: `${chave}-${ano}`, valor: 1 },
    update: { valor: { increment: 1 } },
  })
  return `${prefixo}-${ano}-${String(c.valor).padStart(pad, '0')}`
}

/** Nome de exibição de um usuário do mesmo tenant. */
export async function nomeUsuario(tenantId: string, userId?: string | null): Promise<string | null> {
  if (!userId) return null
  const u = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { firstName: true, lastName: true, email: true } })
  if (!u) return null
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email
}
export async function exigirUsuario(tenantId: string, userId?: string | null) {
  if (!userId) return null
  const n = await nomeUsuario(tenantId, userId)
  if (!n) fail(400, 'Usuário (responsável) não encontrado neste tenant.')
  return n
}
export const nomeDe = (req: AuthenticatedRequest) => nomeUsuario(getTenantId(req), getUserId(req))

/** Usuários com um papel (para avisar a gestão). */
export async function usuariosComPapel(tenantId: string, roles: string[]) {
  return prisma.user.findMany({ where: { tenantId, role: { in: roles as any } }, select: { id: true } })
}

// -------------------------------------------------------------------------- anexos / fotos (passam pelo uploadGuard global)
export const MAX_DATAURL = 2_800_000
export const REFS_ANEXO = ['Solicitacao', 'Ordem', 'Agenda', 'Veiculo', 'Multa', 'Seguro', 'FrotaDoc', 'FrotaManutencao', 'OcorrenciaSeg', 'Reserva'] as const
export const anexoSelect = { id: true, tenantId: true, refType: true, refId: true, nome: true, url: true, mime: true, tamanhoBytes: true, descricao: true, enviadoPorId: true, createdAt: true } as const

export async function criarAnexo(req: AuthenticatedRequest, refType: string, refId: string, body: unknown) {
  const b = parseBody(z.object({
    arquivoNome: z.string().min(1).max(200), mime: z.string().max(120).optional(),
    arquivoUrl: z.string().url().max(2000).optional(), dataUrl: z.string().max(MAX_DATAURL).optional(), descricao: z.string().max(500).optional(),
  }), body)
  if (!b.arquivoUrl && !b.dataUrl) fail(400, 'Informe arquivoUrl (https) ou dataUrl.')
  if (b.arquivoUrl && !/^https:\/\//i.test(b.arquivoUrl)) fail(400, 'arquivoUrl deve usar https.')
  if (b.dataUrl && !/^data:[\w.+/-]+;base64,/i.test(b.dataUrl)) fail(400, 'dataUrl inválido (esperado data:<tipo>;base64,...).')
  const tamanho = b.dataUrl ? Math.floor(((b.dataUrl.length - b.dataUrl.indexOf(',') - 1) * 3) / 4) : undefined
  const mime = b.mime || (b.dataUrl ? b.dataUrl.slice(5, b.dataUrl.indexOf(';')) : undefined)
  const row = await prisma.inf2Anexo.create({ data: { tenantId: getTenantId(req), refType, refId, nome: b.arquivoNome, url: b.arquivoUrl, dataUrl: b.dataUrl, mime, tamanhoBytes: tamanho, descricao: b.descricao, enviadoPorId: getUserId(req) } })
  const { dataUrl, ...out } = row
  return out
}

export const ok = (res: Response, v: unknown, status = 200) => res.status(status).json(v)
export const idParam = (req: Request) => String(req.params.id)

export function csv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => { let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n')
}
