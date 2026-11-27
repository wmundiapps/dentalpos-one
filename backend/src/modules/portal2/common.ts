import { z, ZodTypeAny } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, getTenantId, getUserId } from '../academico/middleware'
import { qs, parseBody } from '../core/crud'

export { qs, parseBody }

const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']
const MGMT = [...SUPER, 'COORDINATOR', 'SECRETARY']

export const role = (req: AuthenticatedRequest) => String(req.user?.role || '').toUpperCase()
export const isSuper = (req: AuthenticatedRequest) => SUPER.includes(role(req))
export const isMgmt = (req: AuthenticatedRequest) => MGMT.includes(role(req))
export const isCoord = (req: AuthenticatedRequest) => isSuper(req) || role(req) === 'COORDINATOR'
export const httpErr = (status: number, msg: string, extra?: object) => Object.assign(new Error(msg), { status, ...extra })

export const NIVEIS = ['GRADUACAO', 'POS_LATO', 'POS_STRICTO', 'CURSO_LIVRE'] as const
export const MODALIDADES = ['PRESENCIAL', 'EAD', 'HIBRIDO'] as const
export const TIPOS_MATERIAL = ['ARQUIVO', 'VIDEO', 'LINK', 'TEXTO', 'ATIVIDADE', 'AULA_GRAVADA', 'AULA_AO_VIVO'] as const
export const TIPOS_PROCESSO = ['TRANCAMENTO', 'DESTRANCAMENTO', 'TRANSFERENCIA', 'APROVEITAMENTO', 'CANCELAMENTO'] as const
export const FINALIDADES = [
  { chave: 'COMUNICACAO_EMAIL', titulo: 'Comunicados por e-mail', descricao: 'Receber avisos acadêmicos e financeiros por e-mail.', baseLegal: 'Consentimento (art. 7º, I)', essencial: false },
  { chave: 'COMUNICACAO_WHATSAPP', titulo: 'Comunicados por WhatsApp/SMS', descricao: 'Receber lembretes e avisos por mensagem.', baseLegal: 'Consentimento (art. 7º, I)', essencial: false },
  { chave: 'MARKETING', titulo: 'Ofertas e novidades', descricao: 'Receber ofertas de cursos, eventos e parcerias.', baseLegal: 'Consentimento (art. 7º, I)', essencial: false },
  { chave: 'USO_IMAGEM', titulo: 'Uso de imagem', descricao: 'Uso da sua imagem em materiais institucionais.', baseLegal: 'Consentimento (art. 7º, I)', essencial: false },
  { chave: 'PESQUISA_INSTITUCIONAL', titulo: 'Pesquisas e avaliações institucionais', descricao: 'Uso de dados anonimizados em estudos de qualidade e evasão.', baseLegal: 'Legítimo interesse (art. 7º, IX)', essencial: false },
  { chave: 'COMPARTILHAMENTO_PARCEIROS', titulo: 'Compartilhamento com parceiros', descricao: 'Compartilhar dados de contato com empresas parceiras (estágio, convênios).', baseLegal: 'Consentimento (art. 7º, I)', essencial: false },
] as const

export function bodyOf<T extends ZodTypeAny>(schema: T, req: AuthenticatedRequest): z.infer<T> {
  return parseBody(schema, req.body)
}

export const zDate = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.date().optional())
export const zStr = (max = 4000) => z.string().trim().max(max)

export function clampPage(q: any, def = 50) {
  const page = Math.max(1, parseInt(String(q.page || '1'), 10) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(String(q.pageSize || def), 10) || def))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

/** URLs de material/entrega: só http(s) (evita javascript: e data: em links clicáveis). */
export function urlSegura(u?: string | null) {
  if (!u) return null
  const s = String(u).trim()
  if (!/^https?:\/\/[^\s]+$/i.test(s)) throw httpErr(400, 'Informe uma URL http(s) válida.')
  return s
}

export function minhaStudentId(req: AuthenticatedRequest): string {
  if (!req.user?.studentId) throw httpErr(403, 'Usuário não vinculado a um aluno.')
  return req.user.studentId
}

/** Aluno logado, ou (gestão) o aluno informado em ?studentId=. */
export function alvoAluno(req: AuthenticatedRequest): string {
  if (role(req) === 'STUDENT') return minhaStudentId(req)
  if (!isMgmt(req)) throw httpErr(403, 'Sem permissão.')
  const id = qs((req.query as any).studentId) || qs(req.body?.studentId)
  if (!id) throw httpErr(400, 'Informe studentId.')
  return id
}

export async function alunoDoTenant(tenantId: string, studentId: string) {
  const s = await prisma.student.findFirst({ where: { id: studentId, tenantId } })
  if (!s) throw httpErr(404, 'Aluno não encontrado.')
  return s
}

/** Turma acessível ao usuário: professor da turma, gestão, ou aluno matriculado. Devolve também o papel de acesso. */
export async function turmaAcesso(req: AuthenticatedRequest, classSectionId: string, opts: { soDocente?: boolean } = {}) {
  const tenantId = getTenantId(req)
  const sec = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId }, include: { discipline: { select: { id: true, nome: true, cargaHoraria: true } }, term: { select: { codigo: true, dataInicio: true, dataFim: true } } } })
  if (!sec) throw httpErr(404, 'Turma não encontrada.')
  const r = role(req)
  if (isMgmt(req)) return { sec, papel: 'GESTAO' as const, studentId: null as string | null }
  if (r === 'TEACHER') {
    if (sec.professorUserId !== getUserId(req)) throw httpErr(403, 'Você não leciona esta turma.')
    return { sec, papel: 'PROFESSOR' as const, studentId: null }
  }
  if (r === 'STUDENT' && !opts.soDocente) {
    const sid = minhaStudentId(req)
    const n = await prisma.classSectionEnrollment.count({ where: { classSectionId, enrollment: { studentId: sid } } })
    if (!n) throw httpErr(403, 'Você não está matriculado nesta turma.')
    return { sec, papel: 'ALUNO' as const, studentId: sid }
  }
  throw httpErr(403, 'Sem permissão para esta turma.')
}

export async function nomesUsuarios(ids: string[]) {
  const us = ids.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true } }) : []
  return new Map(us.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]))
}

export const nomeDe = async (userId: string) => (await nomesUsuarios([userId])).get(userId) || 'Usuário'

export function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 1000) / 10 : null }
export const DAY = 86_400_000
