import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { audit, notify } from '../core/notify'
import { alvoAluno, bodyOf, DAY, httpErr, isMgmt, nomeDe, qs, role, TIPOS_PROCESSO } from './common'
import { montarFluxograma, rotuloProc } from './aluno'

// Processos internos do aluno com acompanhamento por etapas: trancamento, destrancamento, transferência,
// aproveitamento de estudos e cancelamento de matrícula. O aluno abre e acompanha; a secretaria/coordenação conduz.
const router = Router()

const ETAPAS: Record<string, Array<[string, string]>> = {
  TRANCAMENTO: [['Análise da Secretaria', 'Secretaria'], ['Verificação financeira', 'Financeiro'], ['Parecer da Coordenação', 'Coordenação'], ['Efetivação', 'Secretaria']],
  DESTRANCAMENTO: [['Análise da Secretaria', 'Secretaria'], ['Verificação financeira', 'Financeiro'], ['Efetivação', 'Secretaria']],
  TRANSFERENCIA: [['Conferência de documentos', 'Secretaria'], ['Análise acadêmica', 'Coordenação'], ['Quitação financeira', 'Financeiro'], ['Emissão de guia de transferência', 'Secretaria']],
  APROVEITAMENTO: [['Conferência de documentos', 'Secretaria'], ['Análise de equivalência', 'Coordenação'], ['Lançamento no histórico', 'Secretaria']],
  CANCELAMENTO: [['Análise da Secretaria', 'Secretaria'], ['Verificação financeira', 'Financeiro'], ['Efetivação', 'Secretaria']],
}
const FINAIS = ['DEFERIDO', 'INDEFERIDO', 'CONCLUIDO', 'CANCELADO']
const PRAZO_DIAS = 15

async function numero(tenantId: string) {
  const ano = new Date().getFullYear()
  const n = await prisma.porProcesso.count({ where: { tenantId, numero: { startsWith: `PI-${ano}/` } } })
  for (let i = n + 1; i < n + 20; i++) {
    const num = `PI-${ano}/${String(i).padStart(5, '0')}`
    if (!(await prisma.porProcesso.findFirst({ where: { tenantId, numero: num }, select: { id: true } }))) return num
  }
  throw httpErr(500, 'Falha ao gerar o número do processo.')
}

const abrirSchema = z.object({
  tipo: z.enum(TIPOS_PROCESSO),
  justificativa: z.string().trim().min(10, 'Explique o motivo (mín. 10 caracteres).').max(3000),
  dados: z.object({
    // trancamento / destrancamento
    periodoLetivo: z.string().trim().max(20).optional(), retornoPrevisto: z.string().trim().max(20).optional(),
    // transferência
    instituicaoDestino: z.string().trim().max(160).optional(), cursoDestino: z.string().trim().max(160).optional(),
    // aproveitamento
    disciplinaDestinoId: z.string().optional(), disciplinaOrigem: z.string().trim().max(160).optional(), instituicaoOrigem: z.string().trim().max(160).optional(), cargaHorariaOrigem: z.number().int().min(1).max(2000).optional(), notaOrigem: z.number().min(0).max(100).optional(), anexoUrl: z.string().trim().max(2000).optional(),
  }).default({}),
})

router.post('/aluno/processos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  if (role(req) !== 'STUDENT' || !req.user?.studentId) throw httpErr(403, 'Somente o aluno abre processos em seu nome.')
  const studentId = req.user.studentId
  const d = bodyOf(abrirSchema, req)
  const aluno = await prisma.student.findFirst({ where: { id: studentId, tenantId } })
  if (!aluno) throw httpErr(404, 'Aluno não encontrado.')
  const ab = await prisma.porProcesso.findFirst({ where: { tenantId, studentId, tipo: d.tipo, status: { notIn: FINAIS } } })
  if (ab) throw httpErr(409, `Já existe um processo de ${rotuloProc(d.tipo).toLowerCase()} em andamento (${ab.numero}).`)
  const abOutro = await prisma.porProcesso.findFirst({ where: { tenantId, studentId, tipo: { in: ['TRANCAMENTO', 'TRANSFERENCIA', 'CANCELAMENTO', 'DESTRANCAMENTO'] }, status: { notIn: FINAIS } } })
  if (['TRANCAMENTO', 'TRANSFERENCIA', 'CANCELAMENTO', 'DESTRANCAMENTO'].includes(d.tipo) && abOutro) throw httpErr(409, `Finalize antes o processo ${abOutro.numero} (${rotuloProc(abOutro.tipo)}).`)
  if (['TRANCAMENTO', 'TRANSFERENCIA', 'CANCELAMENTO'].includes(d.tipo) && aluno.status !== 'ATIVO') throw httpErr(409, `Sua matrícula está "${aluno.status.toLowerCase()}": este processo exige matrícula ativa.`)
  if (d.tipo === 'DESTRANCAMENTO' && aluno.status !== 'TRANCADO') throw httpErr(409, 'O destrancamento exige matrícula trancada.')
  if (d.tipo === 'TRANSFERENCIA' && !d.dados.instituicaoDestino) throw httpErr(400, 'Informe a instituição de destino.')
  if (d.tipo === 'APROVEITAMENTO') {
    if (!d.dados.disciplinaDestinoId || !d.dados.disciplinaOrigem || !d.dados.instituicaoOrigem || !d.dados.cargaHorariaOrigem) throw httpErr(400, 'Informe a disciplina de destino, a de origem, a instituição e a carga horária cursada.')
    const disc = await prisma.discipline.findFirst({ where: { id: d.dados.disciplinaDestinoId, tenantId } })
    if (!disc) throw httpErr(404, 'Disciplina de destino não encontrada.')
    const hist = await prisma.ntResultado.findFirst({ where: { tenantId, studentId, disciplineId: disc.id, situacao: 'APROVADO' } })
    if (hist) throw httpErr(409, 'Você já foi aprovado nesta disciplina.')
  }
  const num = await numero(tenantId)
  const p = await prisma.porProcesso.create({ data: { tenantId, numero: num, studentId, tipo: d.tipo, justificativa: d.justificativa, dados: d.dados as any, prazoEm: new Date(Date.now() + PRAZO_DIAS * DAY) } })
  await prisma.porProcessoEtapa.createMany({ data: ETAPAS[d.tipo].map(([nome, setor], i) => ({ tenantId, processoId: p.id, ordem: i + 1, nome, setor, status: i === 0 ? 'EM_ANDAMENTO' : 'PENDENTE' })) })
  await prisma.porProcessoEvento.create({ data: { tenantId, processoId: p.id, autorUserId: getUserId(req), autorNome: aluno.nomeCompleto, tipo: 'ABERTURA', texto: `Processo aberto pelo aluno: ${d.justificativa}` } })
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'PROCESSO_ABERTO', refType: 'PorProcesso', refId: p.id, detalhes: { tipo: d.tipo } })
  res.status(201).json(p)
}))

async function detalhe(tenantId: string, id: string) {
  const p = await prisma.porProcesso.findFirst({ where: { id, tenantId } })
  if (!p) throw httpErr(404, 'Processo não encontrado.')
  const [etapas, eventos, aluno] = await Promise.all([
    prisma.porProcessoEtapa.findMany({ where: { tenantId, processoId: p.id }, orderBy: { ordem: 'asc' } }),
    prisma.porProcessoEvento.findMany({ where: { tenantId, processoId: p.id }, orderBy: { createdAt: 'asc' } }),
    prisma.student.findFirst({ where: { id: p.studentId, tenantId }, select: { id: true, ra: true, nomeCompleto: true, status: true } }),
  ])
  const concl = etapas.filter((e) => e.status === 'CONCLUIDA').length
  return { ...p, titulo: rotuloProc(p.tipo), aluno, etapas, eventos, progresso: etapas.length ? Math.round((concl / etapas.length) * 100) : 0, atrasado: !FINAIS.includes(p.status) && !!p.prazoEm && p.prazoEm < new Date() }
}

router.get('/aluno/processos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), studentId = alvoAluno(req)
  const itens = await prisma.porProcesso.findMany({ where: { tenantId, studentId }, orderBy: { createdAt: 'desc' }, take: 100 })
  const et = itens.length ? await prisma.porProcessoEtapa.findMany({ where: { tenantId, processoId: { in: itens.map((i) => i.id) } }, orderBy: { ordem: 'asc' } }) : []
  res.json({ itens: itens.map((p) => { const es = et.filter((e) => e.processoId === p.id); return { ...p, titulo: rotuloProc(p.tipo), etapaAtual: es.find((e) => e.status === 'EM_ANDAMENTO')?.nome ?? null, progresso: es.length ? Math.round((es.filter((e) => e.status === 'CONCLUIDA').length / es.length) * 100) : 0, atrasado: !FINAIS.includes(p.status) && !!p.prazoEm && p.prazoEm < new Date() } }) })
}))

router.get('/processos/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const d = await detalhe(tenantId, String(req.params.id))
  if (role(req) === 'STUDENT' && d.studentId !== req.user?.studentId) throw httpErr(403, 'Este processo não é seu.')
  if (!isMgmt(req) && role(req) !== 'STUDENT') throw httpErr(403, 'Sem permissão.')
  res.json(d)
}))

router.post('/processos/:id/comentarios', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.porProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!p) throw httpErr(404, 'Processo não encontrado.')
  const aluno = role(req) === 'STUDENT'
  if (aluno && p.studentId !== req.user?.studentId) throw httpErr(403, 'Este processo não é seu.')
  if (!aluno && !isMgmt(req)) throw httpErr(403, 'Sem permissão.')
  if (FINAIS.includes(p.status)) throw httpErr(409, 'O processo já foi encerrado.')
  const { texto } = bodyOf(z.object({ texto: z.string().trim().min(2).max(2000) }), req)
  const ev = await prisma.porProcessoEvento.create({ data: { tenantId, processoId: p.id, autorUserId: getUserId(req), autorNome: await nomeDe(getUserId(req)), tipo: aluno ? 'COMENTARIO_ALUNO' : 'COMENTARIO_EQUIPE', texto } })
  // aluno respondeu uma pendência: volta para análise
  if (aluno && p.status === 'PENDENCIA') await prisma.porProcesso.update({ where: { id: p.id }, data: { status: 'EM_ANALISE' } })
  if (!aluno) await notify({ tenantId, studentId: p.studentId, assunto: `Processo ${p.numero}: nova mensagem`, mensagem: texto, refType: 'PorProcesso', refId: p.id }).catch(() => null)
  res.status(201).json(ev)
}))

router.post('/aluno/processos/:id/cancelar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.porProcesso.findFirst({ where: { id: String(req.params.id), tenantId, studentId: req.user?.studentId ?? '-' } })
  if (!p) throw httpErr(404, 'Processo não encontrado.')
  if (FINAIS.includes(p.status)) throw httpErr(409, 'O processo já foi encerrado.')
  await prisma.porProcesso.update({ where: { id: p.id }, data: { status: 'CANCELADO', decisao: 'Cancelado pelo aluno', decididoEm: new Date() } })
  await prisma.porProcessoEvento.create({ data: { tenantId, processoId: p.id, autorUserId: getUserId(req), tipo: 'CANCELAMENTO', texto: 'Processo cancelado pelo aluno.' } })
  res.json({ ok: true })
}))

// ---- fila da secretaria/coordenação ----
const GESTAO = ['COORDINATOR', 'SECRETARY'] as const
router.get('/processos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const where: any = { tenantId }
  if (qs(req.query.status)) where.status = qs(req.query.status)
  if (qs(req.query.tipo)) where.tipo = qs(req.query.tipo)
  if (qs(req.query.abertos) === '1') where.status = { notIn: FINAIS }
  const itens = await prisma.porProcesso.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
  const al = await prisma.student.findMany({ where: { tenantId, id: { in: itens.map((i) => i.studentId) } }, select: { id: true, ra: true, nomeCompleto: true } })
  res.json({ itens: itens.map((p) => ({ ...p, titulo: rotuloProc(p.tipo), aluno: al.find((a) => a.id === p.studentId) ?? null, atrasado: !FINAIS.includes(p.status) && !!p.prazoEm && p.prazoEm < new Date() })) })
}))

router.post('/processos/:id/etapas/:eid', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.porProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!p) throw httpErr(404, 'Processo não encontrado.')
  if (FINAIS.includes(p.status)) throw httpErr(409, 'O processo já foi encerrado.')
  const e = await prisma.porProcessoEtapa.findFirst({ where: { id: String(req.params.eid), processoId: p.id, tenantId } })
  if (!e) throw httpErr(404, 'Etapa não encontrada.')
  const d = bodyOf(z.object({ status: z.enum(['CONCLUIDA', 'REJEITADA', 'EM_ANDAMENTO']), observacao: z.string().trim().max(1000).optional() }), req)
  if (e.status === 'CONCLUIDA' || e.status === 'REJEITADA') throw httpErr(409, 'Esta etapa já foi finalizada.')
  const anteriores = await prisma.porProcessoEtapa.count({ where: { processoId: p.id, ordem: { lt: e.ordem }, status: { not: 'CONCLUIDA' } } })
  if (anteriores && d.status !== 'EM_ANDAMENTO') throw httpErr(409, 'Conclua as etapas anteriores primeiro.')
  await prisma.porProcessoEtapa.update({ where: { id: e.id }, data: { status: d.status, observacao: d.observacao, ...(d.status !== 'EM_ANDAMENTO' ? { concluidaEm: new Date(), concluidaPor: getUserId(req) } : {}) } })
  if (d.status === 'CONCLUIDA') {
    const prox = await prisma.porProcessoEtapa.findFirst({ where: { processoId: p.id, ordem: { gt: e.ordem }, status: 'PENDENTE' }, orderBy: { ordem: 'asc' } })
    if (prox) await prisma.porProcessoEtapa.update({ where: { id: prox.id }, data: { status: 'EM_ANDAMENTO' } })
  }
  if (p.status === 'ABERTO') await prisma.porProcesso.update({ where: { id: p.id }, data: { status: 'EM_ANALISE' } })
  await prisma.porProcessoEvento.create({ data: { tenantId, processoId: p.id, autorUserId: getUserId(req), autorNome: await nomeDe(getUserId(req)), tipo: 'ETAPA', texto: `Etapa "${e.nome}": ${d.status.toLowerCase()}${d.observacao ? ` — ${d.observacao}` : ''}` } })
  res.json(await detalhe(tenantId, p.id))
}))

router.post('/processos/:id/decisao', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const p = await prisma.porProcesso.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!p) throw httpErr(404, 'Processo não encontrado.')
  if (FINAIS.includes(p.status)) throw httpErr(409, 'O processo já foi encerrado.')
  const d = bodyOf(z.object({ status: z.enum(['PENDENCIA', 'DEFERIDO', 'INDEFERIDO']), parecer: z.string().trim().min(3, 'Informe o parecer.').max(2000) }), req)
  if (d.status === 'DEFERIDO') {
    const aberta = await prisma.porProcessoEtapa.count({ where: { processoId: p.id, status: { notIn: ['CONCLUIDA'] } } })
    if (aberta) throw httpErr(409, 'Conclua todas as etapas antes de deferir o processo.')
  }
  const autor = await nomeDe(getUserId(req))
  let efeito: string | null = null
  const upd = await prisma.$transaction(async (tx) => {
    if (d.status === 'DEFERIDO') {
      if (p.tipo === 'TRANCAMENTO') { await tx.student.update({ where: { id: p.studentId }, data: { status: 'TRANCADO' } }); await tx.enrollment.updateMany({ where: { studentId: p.studentId, status: 'ATIVA' }, data: { status: 'TRANCADA' } }); efeito = 'Matrícula trancada.' }
      if (p.tipo === 'DESTRANCAMENTO') { await tx.student.update({ where: { id: p.studentId }, data: { status: 'ATIVO' } }); await tx.enrollment.updateMany({ where: { studentId: p.studentId, status: 'TRANCADA' }, data: { status: 'ATIVA' } }); efeito = 'Matrícula reativada.' }
      if (p.tipo === 'CANCELAMENTO') { await tx.student.update({ where: { id: p.studentId }, data: { status: 'CANCELADO' } }); await tx.enrollment.updateMany({ where: { studentId: p.studentId, status: { in: ['ATIVA', 'TRANCADA'] } }, data: { status: 'CANCELADA' } }); efeito = 'Matrícula cancelada.' }
      if (p.tipo === 'TRANSFERENCIA') { await tx.student.update({ where: { id: p.studentId }, data: { status: 'CANCELADO' } }); await tx.enrollment.updateMany({ where: { studentId: p.studentId, status: { in: ['ATIVA', 'TRANCADA'] } }, data: { status: 'CANCELADA' } }); efeito = 'Matrícula encerrada por transferência.' }
    }
    await tx.porProcessoEvento.create({ data: { tenantId, processoId: p.id, autorUserId: getUserId(req), autorNome: autor, tipo: 'DECISAO', texto: `${d.status}: ${d.parecer}${efeito ? ` (${efeito})` : ''}` } })
    return tx.porProcesso.update({ where: { id: p.id }, data: { status: d.status, decisao: d.parecer, decididoPor: getUserId(req), decididoEm: d.status === 'PENDENCIA' ? null : new Date() } })
  })
  await notify({ tenantId, studentId: p.studentId, assunto: `Processo ${p.numero}: ${d.status.toLowerCase()}`, mensagem: d.parecer, refType: 'PorProcesso', refId: p.id }).catch(() => null)
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'PROCESSO_' + d.status, refType: 'PorProcesso', refId: p.id, detalhes: { efeito } })
  res.json({ ...upd, efeito })
}))

// ---- currículo: tipo de período (semestre/bimestre/módulo/ano) e pré-requisitos do fluxograma ----
const cfgSchema = z.object({ tipoPeriodo: z.enum(['SEMESTRE', 'BIMESTRE', 'TRIMESTRE', 'MODULO', 'ANO']), periodosPorAno: z.number().int().min(1).max(12) })
router.put('/cursos/:programId/fluxograma-config', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), programId = String(req.params.programId)
  const d = bodyOf(cfgSchema, req)
  if (!(await prisma.academicProgram.findFirst({ where: { id: programId, tenantId } }))) throw httpErr(404, 'Curso não encontrado.')
  res.json(await prisma.porCursoConfig.upsert({ where: { tenantId_programId: { tenantId, programId } }, update: d, create: { tenantId, programId, ...d } }))
}))

router.put('/cursos/:programId/pre-requisitos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req), programId = String(req.params.programId)
  const d = bodyOf(z.object({ itens: z.array(z.object({ disciplineId: z.string(), requisitoDisciplineId: z.string() })).max(500) }), req)
  const grade = await prisma.curriculumDiscipline.findMany({ where: { programId, program: { tenantId } }, select: { disciplineId: true, periodo: true } })
  const per = new Map(grade.map((g) => [g.disciplineId, g.periodo]))
  for (const i of d.itens) {
    if (!per.has(i.disciplineId) || !per.has(i.requisitoDisciplineId)) throw httpErr(400, 'Disciplina fora da matriz do curso.')
    if (i.disciplineId === i.requisitoDisciplineId) throw httpErr(400, 'Uma disciplina não pode ser pré-requisito dela mesma.')
    if ((per.get(i.requisitoDisciplineId) ?? 0) >= (per.get(i.disciplineId) ?? 0)) throw httpErr(400, 'O pré-requisito deve estar em um período anterior ao da disciplina.')
  }
  await prisma.$transaction([prisma.porPreRequisito.deleteMany({ where: { tenantId, programId } }), prisma.porPreRequisito.createMany({ data: d.itens.map((i) => ({ tenantId, programId, ...i })), skipDuplicates: true })])
  res.json({ ok: true, itens: d.itens.length })
}))

// fluxograma "genérico" do curso (sem aluno) para coordenação
router.get('/cursos/:programId/fluxograma', requireRole(...GESTAO, 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await montarFluxograma(getTenantId(req), qs(req.query.studentId) ?? '-', String(req.params.programId)))
}))

export default router
