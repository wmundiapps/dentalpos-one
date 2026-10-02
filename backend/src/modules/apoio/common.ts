import { prisma } from '../../lib/prisma'
import { AcademicRole, AuthenticatedRequest, getTenantId } from '../academico/middleware'

export const MODULO = 'apoio'
export const REF = {
  manifestacao: 'ApoManifestacao', ocorrencia: 'ApoOcorrencia', chamado: 'ApoChamado', planoAcao: 'ApoPlanoAcao', concessao: 'ApoConcessaoBolsa',
  termo: 'ApoTermoEstagio', relatorio: 'ApoRelatorioEstagio', planoAee: 'ApoPlanoAee', atendimento: 'ApoAtendimento', aplicacao: 'ApoAplicacao',
  mentoria: 'ApoMentoria', encaminhamento: 'ApoEncaminhamento', empresa: 'ApoEmpresa', formacao: 'ApoFormacao',
}

// Equipe de apoio ao estudante (NAE/NAPNE/psicopedagógico/assistência) = SUPPORT.
export const APOIO: AcademicRole[] = ['SUPPORT']
export const APOIO_COORD: AcademicRole[] = ['SUPPORT', 'COORDINATOR']
export const APOIO_LEITURA: AcademicRole[] = ['SUPPORT', 'COORDINATOR', 'SECRETARY']
export const DOCENTE: AcademicRole[] = ['TEACHER']
export const ALUNO: AcademicRole[] = ['STUDENT']
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
export const isSuper = (req: AuthenticatedRequest) => SUPER.includes(String(req.user?.role))
export const hasRole = (req: AuthenticatedRequest, ...r: AcademicRole[]) => isSuper(req) || r.includes(req.user?.role as AcademicRole)

export function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

// Próximo número sequencial atômico (por tenant+chave).
export async function proximoSeq(tenantId: string, chave: string): Promise<number> {
  const r = await prisma.apoContador.upsert({
    where: { tenantId_chave: { tenantId, chave } },
    create: { tenantId, chave, valor: 1 },
    update: { valor: { increment: 1 } },
  })
  return r.valor
}

export async function numeroAnual(tenantId: string, prefixo: string, now = new Date()) {
  const ano = now.getFullYear()
  const seq = await proximoSeq(tenantId, `${prefixo}-${ano}`)
  return { ano, seq, numero: `${prefixo}-${ano}-${String(seq).padStart(5, '0')}` }
}

export async function andamento(p: { tenantId: string; refType: string; refId: string; tipo: string; texto: string; publico?: boolean; userId?: string; dados?: unknown }) {
  return prisma.apoAndamento.create({
    data: { tenantId: p.tenantId, refType: p.refType, refId: p.refId, tipo: p.tipo, texto: p.texto, publico: p.publico ?? false, userId: p.userId, dados: p.dados as any },
  })
}

export async function carregarAluno(tenantId: string, studentId: string) {
  const s = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, nomeCompleto: true, ra: true, status: true, userId: true } })
  if (!s) throw httpError(404, 'Aluno não encontrado.')
  return s
}

export function exigirAluno(req: AuthenticatedRequest): string {
  const id = req.user?.studentId
  if (!id) throw httpError(403, 'Usuário não vinculado a um aluno.')
  return id
}

// Aluno só age sobre si mesmo; equipe informa studentId.
export function alunoAlvo(req: AuthenticatedRequest, studentIdBody?: string | null): string {
  if (req.user?.role === 'STUDENT') return exigirAluno(req)
  if (!studentIdBody) throw httpError(400, 'Informe studentId.')
  return studentIdBody
}

export async function nomesUsuarios(tenantId: string, ids: Array<string | null | undefined>) {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
  if (!uniq.length) return {} as Record<string, string>
  const us = await prisma.user.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, firstName: true, lastName: true } })
  return Object.fromEntries(us.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
}

export async function nomesAlunos(tenantId: string, ids: Array<string | null | undefined>) {
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)))
  if (!uniq.length) return {} as Record<string, { nome: string; ra: string }>
  const ss = await prisma.student.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, nomeCompleto: true, ra: true } })
  return Object.fromEntries(ss.map((s) => [s.id, { nome: s.nomeCompleto, ra: s.ra }]))
}

export const tid = (req: AuthenticatedRequest) => getTenantId(req)

// Resolve o tenant em rotas públicas: aceita tenantId ou sigla da instituição.
export async function resolverTenantPublico(ref: string): Promise<string | null> {
  const r = String(ref || '').trim()
  if (!r || r.length > 80) return null
  const inst = await prisma.eduInstitution.findFirst({ where: { OR: [{ tenantId: r }, { sigla: { equals: r, mode: 'insensitive' } }] }, select: { tenantId: true } })
  return inst?.tenantId ?? null
}

// Rate limit simples em memória (por chave) para rotas públicas.
const hits = new Map<string, number[]>()
export function limitar(chave: string, max: number, janelaMs: number): boolean {
  const now = Date.now()
  const arr = (hits.get(chave) ?? []).filter((t) => now - t < janelaMs)
  if (arr.length >= max) { hits.set(chave, arr); return false }
  arr.push(now)
  hits.set(chave, arr)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < janelaMs)) hits.delete(k)
  return true
}
