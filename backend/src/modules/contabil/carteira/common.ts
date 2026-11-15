import type { NextFunction, Request, Response } from 'express'
import { z, ZodTypeAny } from 'zod'
import { prisma, papelDe, tenantDe, usuarioDe } from './host'

export { tenantDe as tid, usuarioDe as uid, papelDe, prisma, z }

// ---------- erros ----------
export const httpError = (status: number, message: string, extra?: Record<string, unknown>) => Object.assign(new Error(message), { status, ...(extra || {}) })

// ---------- papéis ----------
// ADMIN/OWNER/RECTOR/BOARD = sócios (acesso total do tenant). GESTOR_CONTABIL = gestor do escritório. CONTADOR e ANALISTA_CONTABIL veem só a própria carteira.
// FINANCE = financeiro do escritório (honorários). CLIENTE_CONTABIL = cliente final (só o portal). STUDENT/TEACHER e demais: sem acesso.
export const GESTAO = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD', 'GESTOR_CONTABIL']
export const CONTADORES = [...GESTAO, 'CONTADOR']
export const EQUIPE = [...CONTADORES, 'ANALISTA_CONTABIL']
export const FINANCEIRO = [...GESTAO, 'FINANCE']
export const INTERNO = [...EQUIPE, 'FINANCE']
export const PORTAL = 'CLIENTE_CONTABIL'
const RESTRITOS = ['CONTADOR', 'ANALISTA_CONTABIL']

export const exigir = (...papeis: string[][]) => {
  const ok = new Set(papeis.flat())
  return (req: Request, res: Response, next: NextFunction) => {
    if (!(req as any).user) return res.status(401).json({ error: 'Não autenticado.' })
    if (ok.has(papelDe(req))) return next()
    return res.status(403).json({ error: 'Sem permissão para esta ação na carteira de clientes.', codigo: 'CARTEIRA_SEM_PERMISSAO' })
  }
}
export const ehGestao = (req: Request) => GESTAO.includes(papelDe(req))
export const restrito = (req: Request) => RESTRITOS.includes(papelDe(req))

/** Filtro de clientes visíveis: contador/analista enxergam só a carteira em que são responsáveis. */
export function whereCliente(req: Request, extra: Record<string, any> = {}) {
  const w: Record<string, any> = { tenantId: tenantDe(req), ...extra }
  if (restrito(req)) w.AND = [...(extra.AND || []), { OR: [{ responsavelId: usuarioDe(req) }, { analistaId: usuarioDe(req) }] }]
  return w
}
/** Ids dos clientes visíveis (null = todos, sem restrição). */
export async function idsVisiveis(req: Request): Promise<string[] | null> {
  if (!restrito(req)) return null
  const rows = await prisma.ctbCliente.findMany({ where: whereCliente(req), select: { id: true } })
  return rows.map((r) => r.id)
}
export async function clienteOuErro(req: Request, id: string) {
  const c = await prisma.ctbCliente.findFirst({ where: whereCliente(req, { id: String(id) }) })
  if (!c) throw httpError(404, 'Cliente não encontrado.')
  return c
}
export const filtroClientes = (ids: string[] | null) => (ids ? { clienteId: { in: ids } } : {})

// ---------- entrada ----------
export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body ?? {})
  if (!r.success) throw httpError(400, `Dados inválidos — ${r.error.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ')}`)
  return r.data
}
export const qs = (v: unknown): string | undefined => { const x = Array.isArray(v) ? v[0] : v; return x == null || x === '' ? undefined : String(x) }
export function pageParams(q: any, max = 200) {
  const page = Math.min(100_000, Math.max(1, parseInt(String(q.page || '1'), 10) || 1))
  const pageSize = Math.min(max, Math.max(1, parseInt(String(q.pageSize || '50'), 10) || 50))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}
/** Texto livre: tira controles, limita tamanho. (A renderização do front e dos HTMLs escapa; aqui só normalizamos.) */
export const txt = (max = 200) => z.string().trim().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''))
export const txtOpt = (max = 200) => txt(max).optional().nullable().transform((v) => (v ? v : null))
export const emailOpt = z.string().trim().toLowerCase().email('e-mail inválido').max(160).optional().nullable().or(z.literal('').transform(() => null))
export const comp = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'competência deve ser AAAA-MM')
/** Competência vinda de query: 400 em vez de 500 quando malformada. */
export const compQ = (v: unknown, padrao: string) => { const r = comp.safeParse(v ?? padrao); if (!r.success) throw httpError(400, 'Competência/mês inválido (use AAAA-MM).'); return r.data }
export const dataIso = z.union([z.string(), z.date()]).transform((v, ctx) => { const d = dia(v); if (!d) { ctx.addIssue({ code: 'custom', message: 'data inválida' }); return z.NEVER } return d })
export const dataOpt = dataIso.optional().nullable()

// ---------- datas (calendário em meio-dia UTC) ----------
export function dia(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  const s = typeof v === 'string' ? v : v.toISOString()
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s)
  return isNaN(d.getTime()) ? null : d
}
export const hojeMeioDia = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 12)) }
export const somaDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
export const iso10 = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
export const compAtual = () => iso10(hojeMeioDia()).slice(0, 7)
export const compDe = (d: Date) => iso10(d).slice(0, 7)
export function somaMeses(competencia: string, n: number) {
  const [a, m] = competencia.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
export const diaDoMes = (competencia: string, dd: number) => { const [a, m] = competencia.split('-').map(Number); const ult = new Date(Date.UTC(a, m, 0)).getUTCDate(); return new Date(Date.UTC(a, m - 1, Math.min(Math.max(1, dd), ult), 12)) }
export const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// ---------- configuração do escritório ----------
export const getCfg = (tenantId: string) => prisma.ctbCarConfig.upsert({ where: { tenantId }, create: { tenantId }, update: {} })

// ---------- CSV / HTML ----------
/** Evita injeção de fórmula em planilhas (=, +, -, @, tab, CR no início da célula). */
export function celulaCsv(v: unknown): string {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const gerarCsv = (colunas: string[], linhas: unknown[][]) => '﻿' + [colunas.map(celulaCsv).join(';'), ...linhas.map((l) => l.map(celulaCsv).join(';'))].join('\r\n') + '\r\n'

export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
export const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
export const dataBr = (d: Date | null | undefined) => (d ? `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}/${d.getUTCFullYear()}` : '—')

export const AVISO = 'Este sistema não substitui um contador. Cálculos e guias são estimativas/simulações; valide com seu contador antes de enviar ou pagar. Seus dados são tratados conforme a LGPD.'

export function paginaHtml(titulo: string, corpo: string, rodape = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px auto;max-width:900px;padding:0 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 6px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #bbb;padding:5px 8px;text-align:left;vertical-align:top}th{background:#eee}.dir{text-align:right}.aviso{border:1px solid #b45309;background:#fff7ed;color:#7c2d12;padding:8px 10px;font-size:12px;margin:14px 0;border-radius:6px}.sim{display:inline-block;border:1px dashed #6d28d9;color:#6d28d9;padding:2px 8px;font-size:11px;border-radius:10px}small{color:#555}@media print{.nao-imprimir{display:none}body{margin:0}}</style></head>
<body><div class="nao-imprimir"><button onclick="window.print()">Imprimir</button></div>${corpo}<div class="aviso">${esc(AVISO)}</div>${rodape}<small>EduMaster Pro · SUA INSTITUIÇÃO · emitido em ${new Date().toLocaleString('pt-BR')}</small></body></html>`
}

export const asArray = <T = any>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
