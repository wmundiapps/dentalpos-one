import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, getTenantId, getUserId } from '../academico/middleware'

export const MOD = 'academico2'
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
// Secretaria de alunos
export const SEC_READ: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'FINANCE', 'ADMISSIONS', 'SUPPORT']
export const SEC_WRITE: AcademicRole[] = ['COORDINATOR', 'SECRETARY']
// Currículo e salas
export const CUR_READ: AcademicRole[] = ['COORDINATOR', 'SECRETARY', 'TEACHER', 'FACILITIES', 'SUPPORT']
export const CUR_WRITE: AcademicRole[] = ['COORDINATOR', 'SECRETARY']
// Desenvolvimento do aluno
export const DEV_READ: AcademicRole[] = ['COORDINATOR', 'TEACHER', 'SUPPORT', 'SECRETARY']
export const DEV_WRITE: AcademicRole[] = ['COORDINATOR', 'SUPPORT']
export const ORIENT: AcademicRole[] = ['COORDINATOR', 'SUPPORT']

export const tid = (r: AuthenticatedRequest) => getTenantId(r)
export const uid = (r: AuthenticatedRequest) => getUserId(r)
export const roleOf = (r: AuthenticatedRequest) => String(r.user?.role || '').toUpperCase()
export const isSuper = (r: AuthenticatedRequest) => SUPER.includes(roleOf(r))
export const temPapel = (r: AuthenticatedRequest, ...p: string[]) => isSuper(r) || p.includes(roleOf(r))

export function fail(status: number, msg: string, extra?: Record<string, unknown>): never {
  throw Object.assign(new Error(msg), { status, ...(extra ?? {}) })
}

export const optStr = (max = 2000) => z.preprocess((v) => (v === '' ? undefined : v), z.string().max(max).nullish())
export const optDate = () => z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.date().optional())
export const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
export const br = (d: Date | null | undefined) => (d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '')
export const soDigitos = (s: unknown) => String(s ?? '').replace(/\D+/g, '')
export const nz = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v)

export async function assertNoTenant(tenantId: string, model: string, id: string | null | undefined, rotulo: string) {
  if (!id) return
  const row = await (prisma as any)[model].findFirst({ where: { id, tenantId }, select: { id: true } })
  if (!row) fail(400, `${rotulo} não encontrado(a) nesta instituição.`)
}

/** Interpreta código de período letivo "2026/2", "2026.1", "2026-2" -> { ano, periodo }. */
export function parseTerm(codigo: string): { ano: number | null; periodo: number | null } {
  const m = /^(\d{4})\s*[\/.\-]\s*(\d{1,2})/.exec(codigo || '')
  if (m) return { ano: Number(m[1]), periodo: Number(m[2]) }
  const a = /^(\d{4})/.exec(codigo || '')
  return { ano: a ? Number(a[1]) : null, periodo: null }
}

export function escHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export const chunk = <T>(a: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
export const uniq = <T>(a: T[]): T[] => [...new Set(a)]

/** Página HTML imprimível (Ctrl+P -> PDF) com cabeçalho institucional simples. */
export function paginaHtml(titulo: string, subtitulo: string, corpo: string, instituicao = 'EduMaster Pro'): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(titulo)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#14213d}h1{font-size:20px;margin:0}h2{font-size:15px;margin:18px 0 6px}.sub{color:#555;font-size:12px;margin:2px 0 14px}
table{border-collapse:collapse;width:100%;font-size:12px;margin-bottom:12px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eef2f7}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.card{border:1px solid #ccc;border-radius:8px;padding:8px;text-align:center;font-size:12px}.av{width:72px;height:72px;border-radius:50%;background:#dbe4f3;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:#33415c;overflow:hidden}.av img{width:100%;height:100%;object-fit:cover}
@media print{body{margin:8mm}button{display:none}}</style></head><body><h1>${escHtml(instituicao)} — ${escHtml(titulo)}</h1><div class="sub">${escHtml(subtitulo)} · gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>${corpo}<button onclick="window.print()">Imprimir / salvar PDF</button></body></html>`
}
