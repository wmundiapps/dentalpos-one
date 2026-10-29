import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit } from '../core/notify'
import { bodyOf, httpErr, isMgmt, role, NIVEIS, MODALIDADES } from './common'

// ============================================================================
// AMBIENTES DE ENSINO (Graduação presencial/EAD, Pós Lato Sensu, Stricto Sensu, Cursos Livres)
// - o usuário escolhe o ambiente; a escolha fica em PorContexto (por usuário) e pode ser sobrescrita por aba com o
//   cabeçalho X-Edu-Ambiente;
// - o middleware `ambienteContext` coloca req.ambiente; listas do sistema usam wherePrograma/whereTurma/whereAluno.
// ============================================================================

export interface AmbienteCtx { id: string; codigo: string; nome: string; nivel: string; modalidade: string; programIds: string[] }
declare module 'express-serve-static-core' { interface Request { ambiente?: AmbienteCtx | null } }

const cache = new Map<string, { at: number; v: AmbienteCtx | null }>()
const TTL = 10_000
export const limparCacheAmbientes = () => cache.clear()

async function carregar(tenantId: string, ambienteId: string): Promise<AmbienteCtx | null> {
  const k = `${tenantId}:${ambienteId}`
  const hit = cache.get(k)
  if (hit && Date.now() - hit.at < TTL) return hit.v
  const a = await prisma.porAmbiente.findFirst({ where: { id: ambienteId, tenantId, ativo: true } })
  let v: AmbienteCtx | null = null
  if (a) {
    const links = await prisma.porAmbienteCurso.findMany({ where: { tenantId, ambienteId }, select: { programId: true } })
    v = { id: a.id, codigo: a.codigo, nome: a.nome, nivel: a.nivel, modalidade: a.modalidade, programIds: links.map((l) => l.programId) }
  }
  cache.set(k, { at: Date.now(), v })
  return v
}

/** Cursos que o usuário enxerga (para validar a escolha de ambiente). null = todos (gestão/equipe). */
async function programasDoUsuario(req: AuthenticatedRequest): Promise<string[] | null> {
  const tenantId = getTenantId(req)
  const r = role(req)
  if (r === 'STUDENT' && req.user?.studentId) {
    const e = await prisma.enrollment.findMany({ where: { studentId: req.user.studentId, student: { tenantId } }, select: { programId: true } })
    return [...new Set(e.map((x) => x.programId))]
  }
  if (r === 'TEACHER') {
    const secs = await prisma.classSection.findMany({ where: { tenantId, professorUserId: getUserId(req) }, select: { disciplineId: true } })
    if (!secs.length) return []
    const c = await prisma.curriculumDiscipline.findMany({ where: { disciplineId: { in: secs.map((s) => s.disciplineId) }, program: { tenantId } }, select: { programId: true } })
    return [...new Set(c.map((x) => x.programId))]
  }
  return null
}

export async function ambientesDisponiveis(req: AuthenticatedRequest) {
  const tenantId = getTenantId(req)
  const todos = await prisma.porAmbiente.findMany({ where: { tenantId, ativo: true }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] })
  const links = await prisma.porAmbienteCurso.findMany({ where: { tenantId } })
  const progs = await programasDoUsuario(req)
  return todos
    .map((a) => ({ ...a, programIds: links.filter((l) => l.ambienteId === a.id).map((l) => l.programId) }))
    .filter((a) => progs === null || a.programIds.some((p) => progs.includes(p)))
}

/** Middleware global do EduMaster: resolve o ambiente corrente (cabeçalho > contexto salvo). Nunca derruba a requisição. */
export async function ambienteContext(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    req.ambiente = null
    if (!req.user || req.method === 'OPTIONS') return next()
    const hdr = String(req.headers['x-edu-ambiente'] || '').trim()
    let id: string | undefined = hdr && hdr !== 'todos' ? hdr : undefined
    if (!hdr) {
      const ctx = await prisma.porContexto.findUnique({ where: { tenantId_userId: { tenantId: req.user.tenantId, userId: req.user.id } } })
      id = ctx?.ambienteId
    }
    if (id) {
      const a = await carregar(req.user.tenantId, id)
      if (a) {
        const progs = await programasDoUsuario(req)
        if (progs === null || a.programIds.some((p) => progs.includes(p))) req.ambiente = a
      }
    }
  } catch { req.ambiente = null }
  next()
}

/** Filtros prontos para o Prisma. Sem ambiente selecionado devolvem {} (sem restrição). */
export const ambienteProgramIds = (req: AuthenticatedRequest): string[] | null => (req.ambiente ? req.ambiente.programIds : null)
export function wherePrograma(req: AuthenticatedRequest): Record<string, any> {
  const ids = ambienteProgramIds(req)
  return ids ? { id: { in: ids } } : {}
}
export function whereTurma(req: AuthenticatedRequest): Record<string, any> {
  const ids = ambienteProgramIds(req)
  return ids ? { discipline: { curriculos: { some: { programId: { in: ids } } } } } : {}
}
export function whereAluno(req: AuthenticatedRequest): Record<string, any> {
  const ids = ambienteProgramIds(req)
  return ids ? { matriculas: { some: { programId: { in: ids } } } } : {}
}

const GESTAO = ['COORDINATOR', 'SECRETARY'] as const
const ambSchema = z.object({
  codigo: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_\-]+$/i, 'Código só aceita letras, números, _ e -'),
  nome: z.string().trim().min(2).max(120),
  nivel: z.enum(NIVEIS),
  modalidade: z.enum(MODALIDADES).default('PRESENCIAL'),
  variante: z.string().trim().max(60).optional().nullable(),
  unidade: z.string().trim().max(120).optional().nullable(),
  campusId: z.string().optional().nullable(),
  poloId: z.string().optional().nullable(),
  cor: z.string().trim().max(20).optional().nullable(),
  descricao: z.string().trim().max(500).optional().nullable(),
  ordem: z.number().int().min(0).max(999).optional(),
  ativo: z.boolean().optional(),
})

export const AMBIENTES_PADRAO = [
  { codigo: 'GRAD-PRES', nome: 'Graduação Presencial', nivel: 'GRADUACAO', modalidade: 'PRESENCIAL', cor: '#0F5FDB', ordem: 1, descricao: 'Cursos de bacharelado, licenciatura e tecnológicos presenciais.' },
  { codigo: 'GRAD-EAD', nome: 'Graduação EAD', nivel: 'GRADUACAO', modalidade: 'EAD', cor: '#7C3AED', ordem: 2, descricao: 'Graduação a distância, com polos de apoio presencial.' },
  { codigo: 'LATO-PRES', nome: 'Pós-graduação Lato Sensu · Presencial', nivel: 'POS_LATO', modalidade: 'PRESENCIAL', cor: '#0E7490', ordem: 3, descricao: 'Especializações e MBA presenciais.' },
  { codigo: 'LATO-EAD', nome: 'Pós-graduação Lato Sensu · EAD', nivel: 'POS_LATO', modalidade: 'EAD', cor: '#0D9488', ordem: 4, descricao: 'Especializações e MBA a distância.' },
  { codigo: 'LATO-UNID', nome: 'Pós-graduação Lato Sensu · Unidades (+A)', nivel: 'POS_LATO', modalidade: 'HIBRIDO', variante: '+A', unidade: 'Unidades parceiras', cor: '#B45309', ordem: 5, descricao: 'Turmas de especialização ofertadas em unidades/parceiros.' },
  { codigo: 'STRICTO', nome: 'Pós-graduação Stricto Sensu', nivel: 'POS_STRICTO', modalidade: 'PRESENCIAL', cor: '#9333EA', ordem: 6, descricao: 'Mestrado e doutorado (programas e linhas de pesquisa).' },
  { codigo: 'LIVRES', nome: 'Cursos Livres', nivel: 'CURSO_LIVRE', modalidade: 'HIBRIDO', cor: '#DB2777', ordem: 7, descricao: 'Extensão, atualização e cursos livres.' },
] as const

const router = Router()

// Ambiente atual + lista dos que o usuário pode usar (o atual vem marcado).
router.get('/ambientes/meus', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const lista = await ambientesDisponiveis(req)
  const atualId = req.ambiente?.id ?? null
  res.json({
    atual: atualId, todosPermitido: isMgmt(req) || !['STUDENT', 'TEACHER'].includes(role(req)),
    itens: lista.map((a) => ({ id: a.id, codigo: a.codigo, nome: a.nome, nivel: a.nivel, modalidade: a.modalidade, variante: a.variante, unidade: a.unidade, cor: a.cor, descricao: a.descricao, cursos: a.programIds.length, atual: a.id === atualId })),
  })
}))

router.get('/ambientes/atual', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json({ ambiente: req.ambiente ?? null })
}))

router.post('/ambientes/selecionar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), userId = getUserId(req)
  const { ambienteId } = bodyOf(z.object({ ambienteId: z.string().nullable().optional() }), req)
  if (!ambienteId) {
    if (['STUDENT', 'TEACHER'].includes(role(req))) throw httpErr(400, 'Escolha um dos seus ambientes de ensino.')
    await prisma.porContexto.deleteMany({ where: { tenantId, userId } })
    return res.json({ atual: null })
  }
  const ok = (await ambientesDisponiveis(req)).find((a) => a.id === ambienteId)
  if (!ok) throw httpErr(403, 'Este ambiente não está disponível para o seu perfil.')
  await prisma.porContexto.upsert({ where: { tenantId_userId: { tenantId, userId } }, update: { ambienteId }, create: { tenantId, userId, ambienteId } })
  await audit({ tenantId, userId, modulo: 'portal2', acao: 'AMBIENTE_SELECIONADO', refType: 'PorAmbiente', refId: ambienteId })
  res.json({ atual: ambienteId, nome: ok.nome })
}))

// ---- gestão dos ambientes ----
router.get('/ambientes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const [itens, links, progs] = await Promise.all([
    prisma.porAmbiente.findMany({ where: { tenantId }, orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] }),
    prisma.porAmbienteCurso.findMany({ where: { tenantId } }),
    prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true, modalidade: true }, orderBy: { nome: 'asc' } }),
  ])
  res.json({ itens: itens.map((a) => ({ ...a, programIds: links.filter((l) => l.ambienteId === a.id).map((l) => l.programId) })), cursos: progs })
}))

router.post('/ambientes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = bodyOf(ambSchema, req)
  const dup = await prisma.porAmbiente.findFirst({ where: { tenantId, codigo: d.codigo.toUpperCase() } })
  if (dup) throw httpErr(409, 'Já existe um ambiente com este código.')
  const a = await prisma.porAmbiente.create({ data: { tenantId, ...d, codigo: d.codigo.toUpperCase() } as any })
  limparCacheAmbientes()
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'AMBIENTE_CRIADO', refType: 'PorAmbiente', refId: a.id })
  res.status(201).json(a)
}))

router.patch('/ambientes/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = bodyOf(ambSchema.partial(), req)
  const cur = await prisma.porAmbiente.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!cur) throw httpErr(404, 'Ambiente não encontrado.')
  if (d.codigo && d.codigo.toUpperCase() !== cur.codigo && await prisma.porAmbiente.findFirst({ where: { tenantId, codigo: d.codigo.toUpperCase() } })) throw httpErr(409, 'Já existe um ambiente com este código.')
  const a = await prisma.porAmbiente.update({ where: { id: cur.id }, data: { ...d, ...(d.codigo ? { codigo: d.codigo.toUpperCase() } : {}) } as any })
  limparCacheAmbientes()
  res.json(a)
}))

router.put('/ambientes/:id/cursos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { programIds } = bodyOf(z.object({ programIds: z.array(z.string()).max(500) }), req)
  const a = await prisma.porAmbiente.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) throw httpErr(404, 'Ambiente não encontrado.')
  const validos = await prisma.academicProgram.findMany({ where: { tenantId, id: { in: programIds } }, select: { id: true } })
  await prisma.$transaction([
    prisma.porAmbienteCurso.deleteMany({ where: { ambienteId: a.id } }),
    prisma.porAmbienteCurso.createMany({ data: validos.map((p) => ({ tenantId, ambienteId: a.id, programId: p.id })), skipDuplicates: true }),
  ])
  limparCacheAmbientes()
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'AMBIENTE_CURSOS', refType: 'PorAmbiente', refId: a.id, detalhes: { cursos: validos.length } })
  res.json({ ok: true, cursos: validos.length })
}))

router.post('/ambientes/bootstrap', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  let criados = 0
  for (const a of AMBIENTES_PADRAO) {
    const ex = await prisma.porAmbiente.findFirst({ where: { tenantId, codigo: a.codigo } })
    if (!ex) { await prisma.porAmbiente.create({ data: { tenantId, ...a } as any }); criados++ }
  }
  limparCacheAmbientes()
  res.json({ criados })
}))

export default router
