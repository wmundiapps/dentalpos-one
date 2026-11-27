import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { calcCR, estatisticas, Situacao } from './calc'
import { carregarCtx, calcularTurma } from './service'
import { role, httpErr } from './common'

const router = Router()
const GESTAO = ['COORDINATOR', 'SECRETARY'] as const

async function periodosPadrao(tenantId: string, termId?: string): Promise<string[]> {
  if (termId) return [termId]
  const now = new Date()
  const ativos = await prisma.academicTerm.findMany({ where: { tenantId, dataInicio: { lte: now }, dataFim: { gte: now } }, select: { id: true } })
  if (ativos.length) return ativos.map((t) => t.id)
  const ult = await prisma.academicTerm.findFirst({ where: { tenantId }, orderBy: { dataFim: 'desc' }, select: { id: true } })
  return ult ? [ult.id] : []
}

async function disciplinasDoCurso(programId: string) {
  const cds = await prisma.curriculumDiscipline.findMany({ where: { programId }, select: { disciplineId: true } })
  return cds.map((c) => c.disciplineId)
}

// Visão do curso: desempenho por turma no período.
router.get('/gestao/cursos/:programId/visao', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const programId = String(req.params.programId)
  const prog = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId } })
  if (!prog) throw httpErr(404, 'Curso não encontrado.')
  const terms = await periodosPadrao(tenantId, qs(req.query.termId))
  const discIds = await disciplinasDoCurso(programId)
  const secs = await prisma.classSection.findMany({ where: { tenantId, termId: { in: terms }, disciplineId: { in: discIds } }, include: { discipline: { select: { nome: true } } } })
  const ids = secs.map((s) => s.id)
  const [res_, diarios] = await Promise.all([
    prisma.ntResultado.findMany({ where: { tenantId, classSectionId: { in: ids } } }),
    prisma.ntDiario.findMany({ where: { tenantId, classSectionId: { in: ids } } }),
  ])
  const turmas = secs.map((s) => {
    const rs = res_.filter((r) => r.classSectionId === s.id)
    const sit: Record<string, number> = {}
    rs.forEach((r) => { sit[r.situacao] = (sit[r.situacao] ?? 0) + 1 })
    const fin = rs.filter((r) => ['APROVADO', 'REPROVADO_NOTA', 'REPROVADO_FREQ'].includes(r.situacao))
    return {
      classSectionId: s.id, turma: s.nome, disciplina: s.discipline.nome, diarioStatus: diarios.find((d) => d.classSectionId === s.id)?.status ?? 'ABERTO',
      alunos: rs.length, situacoes: sit, mediaFinal: estatisticas(rs.map((r) => r.mediaFinal)).media,
      taxaAprovacao: fin.length ? Math.round((fin.filter((r) => r.situacao === 'APROVADO').length / fin.length) * 1000) / 10 : null,
    }
  })
  const todos = res_.filter((r) => ['APROVADO', 'REPROVADO_NOTA', 'REPROVADO_FREQ'].includes(r.situacao))
  res.json({
    curso: { id: prog.id, nome: prog.nome }, termIds: terms, turmas: turmas.sort((a, b) => (a.taxaAprovacao ?? 101) - (b.taxaAprovacao ?? 101)),
    totais: {
      turmas: turmas.length, diariosFechados: turmas.filter((t) => t.diarioStatus === 'FECHADO').length, resultados: res_.length,
      taxaAprovacao: todos.length ? Math.round((todos.filter((r) => r.situacao === 'APROVADO').length / todos.length) * 1000) / 10 : null,
      distribuicaoMediaFinal: estatisticas(res_.map((r) => r.mediaFinal)).distribuicao,
    },
  })
}))

// Ranking de alunos por CR (curso e/ou período).
router.get('/gestao/ranking', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const programId = qs(req.query.programId)
  const termId = qs(req.query.termId)
  const limit = Math.min(200, parseInt(qs(req.query.limit) ?? '50', 10) || 50)
  const where: any = { tenantId, encerrado: true, mediaFinal: { not: null } }
  if (termId) where.termId = termId
  if (programId) {
    const enr = await prisma.enrollment.findMany({ where: { programId, student: { tenantId } }, select: { studentId: true } })
    where.studentId = { in: [...new Set(enr.map((e) => e.studentId))] }
  }
  const rows = await prisma.ntResultado.findMany({ where, take: 20000 })
  const disc = await prisma.discipline.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.disciplineId).filter(Boolean) as string[])] } }, select: { id: true, cargaHoraria: true } })
  const ch = new Map(disc.map((d) => [d.id, d.cargaHoraria]))
  const por = new Map<string, typeof rows>()
  rows.forEach((r) => { if (!por.has(r.studentId)) por.set(r.studentId, []); por.get(r.studentId)!.push(r) })
  const lista = [...por.entries()].map(([studentId, rs]) => ({
    studentId, disciplinas: rs.length, aprovadas: rs.filter((r) => r.situacao === 'APROVADO').length,
    cr: calcCR(rs.map((r) => ({ mediaFinal: r.mediaFinal, cargaHoraria: ch.get(r.disciplineId ?? '') ?? 0, situacao: r.situacao as Situacao }))),
  })).filter((x) => x.cr != null).sort((a, b) => (b.cr as number) - (a.cr as number)).slice(0, limit)
  const alunos = await prisma.student.findMany({ where: { tenantId, id: { in: lista.map((l) => l.studentId) } }, select: { id: true, ra: true, nomeCompleto: true } })
  res.json({ items: lista.map((l, i) => ({ posicao: i + 1, ...l, ra: alunos.find((a) => a.id === l.studentId)?.ra, nome: alunos.find((a) => a.id === l.studentId)?.nomeCompleto })) })
}))

// Alunos em risco (nota/frequência), calculado em tempo real nas turmas do período (limite de 60 turmas por chamada).
router.get('/gestao/risco', requireRole('COORDINATOR', 'SECRETARY', 'TEACHER'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const terms = await periodosPadrao(tenantId, qs(req.query.termId))
  const where: any = { tenantId, termId: { in: terms } }
  if (role(req) === 'TEACHER') where.professorUserId = getUserId(req)
  const programId = qs(req.query.programId)
  if (programId) where.disciplineId = { in: await disciplinasDoCurso(programId) }
  if (qs(req.query.classSectionId)) where.id = qs(req.query.classSectionId)
  const secs = await prisma.classSection.findMany({ where, take: 60, select: { id: true } })
  const nivelMin = qs(req.query.nivel) === 'ALTO' ? 'ALTO' : 'ATENCAO'
  const itens: any[] = []
  for (const s of secs) {
    const ctx = await carregarCtx(tenantId, s.id)
    if (!ctx) continue
    const calc = await calcularTurma(tenantId, ctx)
    for (const a of calc.alunos) {
      if (a.risco.nivel === 'NENHUM' || (nivelMin === 'ALTO' && a.risco.nivel !== 'ALTO')) continue
      itens.push({ classSectionId: s.id, turma: ctx.section.nome, studentId: a.aluno.studentId, ra: a.aluno.ra, nome: a.aluno.nome, nivel: a.risco.nivel, motivos: a.risco.motivos, mediaParcial: a.resultado.mediaParcial, frequenciaPct: a.frequencia.pct, notaNecessaria: a.notaNecessaria.necessaria })
    }
  }
  itens.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'ALTO' ? -1 : 1))
  res.json({ turmasAnalisadas: secs.length, total: itens.length, items: itens })
}))

// Pendências de lançamento: avaliações já ocorridas (dataPrevista passada) sem nota para algum aluno.
router.get('/gestao/pendencias', requireRole('TEACHER', 'COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const terms = await periodosPadrao(tenantId, qs(req.query.termId))
  const where: any = { tenantId, termId: { in: terms } }
  if (role(req) === 'TEACHER') where.professorUserId = getUserId(req)
  else if (qs(req.query.professorUserId)) where.professorUserId = qs(req.query.professorUserId)
  const secs = await prisma.classSection.findMany({ where, select: { id: true, nome: true, professorUserId: true, _count: { select: { matriculados: true } } }, take: 300 })
  const ids = secs.map((s) => s.id)
  const [diarios, comps] = await Promise.all([
    prisma.ntDiario.findMany({ where: { tenantId, classSectionId: { in: ids } } }),
    prisma.ntComponente.findMany({ where: { tenantId, classSectionId: { in: ids }, tipo: 'AVALIACAO', obrigatorio: true } }),
  ])
  const cont = await prisma.ntLancamento.groupBy({ by: ['componenteId'], where: { tenantId, classSectionId: { in: ids }, OR: [{ valor: { not: null } }, { ausente: true }] }, _count: true })
  const now = Date.now()
  const items = secs.map((s) => {
    const d = diarios.find((x) => x.classSectionId === s.id)
    const cs = comps.filter((c) => c.classSectionId === s.id)
    const pend = cs.map((c) => ({ codigo: c.codigo, dataPrevista: c.dataPrevista, faltam: Math.max(0, s._count.matriculados - (cont.find((x) => x.componenteId === c.id)?._count ?? 0)), vencida: !!c.dataPrevista && c.dataPrevista.getTime() < now })).filter((p) => p.faltam > 0)
    return { classSectionId: s.id, turma: s.nome, professorUserId: s.professorUserId, diarioStatus: d?.status ?? 'ABERTO', semComponentes: cs.length === 0, pendencias: pend, vencidas: pend.filter((p) => p.vencida).length }
  }).filter((i) => i.diarioStatus === 'ABERTO' && (i.pendencias.length || i.semComponentes))
  res.json({ total: items.length, items: items.sort((a, b) => b.vencidas - a.vencidas) })
}))

export default router
