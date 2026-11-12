import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { MOD, GESTAO, DOCENTE, httpErr, getConfig, alunosDoCurso, nomesAlunos, chunk } from './common'
import { indiceProntidao, mediaUltimas, round } from './logic'
import { sessoesConcluidas, agregarSessoes } from './analise'

const router = Router()
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable()
const DAY = 86_400_000

/** Média das 3 últimas sessões por aluno (somente quem já fez alguma sessão). */
async function mediasPorAluno(tenantId: string, studentIds: string[], exameIds?: string[]) {
  const sess = studentIds.length ? await prisma.exaSessao.findMany({ where: { tenantId, studentId: { in: studentIds }, status: { in: ['ENVIADA', 'EXPIRADA'] }, ...(exameIds ? { simulado: { exameId: { in: exameIds } } } : {}) }, orderBy: { enviadaEm: 'asc' }, select: { studentId: true, percentual: true, enviadaEm: true } }) : []
  const m = new Map<string, number[]>(), ult = new Map<string, Date | null>()
  for (const s of sess) { m.set(s.studentId, [...(m.get(s.studentId) ?? []), s.percentual ?? 0]); ult.set(s.studentId, s.enviadaEm) }
  return studentIds.map((studentId) => ({ studentId, media: mediaUltimas(m.get(studentId) ?? [], 3), sessoes: (m.get(studentId) ?? []).length, ultima: ult.get(studentId) ?? null }))
}

async function exameIdsDe(tenantId: string, exameId?: string) {
  if (exameId) {
    if (!(await prisma.desExame.findFirst({ where: { id: exameId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Exame não encontrado.')
    return [exameId]
  }
  return (await prisma.desExame.findMany({ where: { tenantId, tipo: 'ENADE' }, select: { id: true } })).map((e) => e.id)
}

/** Gancho para o painel da reitoria/regulatório: índice de prontidão ENADE (0-100) do curso ou da instituição. */
export async function prontidaoEnade(tenantId: string, programId?: string) {
  const cfg = await getConfig(tenantId)
  const exames = await exameIdsDe(tenantId)
  const alunos = programId ? await alunosDoCurso(tenantId, programId) : [...new Set((await prisma.enrollment.findMany({ where: { status: 'ATIVA', student: { tenantId } }, select: { studentId: true }, take: 20000 })).map((e) => e.studentId))]
  const meds = await mediasPorAluno(tenantId, alunos, exames)
  return indiceProntidao(meds, { meta: cfg.metaProntidaoPct, limiteRisco: cfg.limiteRiscoPct })
}

router.get('/coordenacao/painel', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const programId = qs(req.query.programId)
  if (!programId) throw httpErr(400, 'Informe programId (curso).')
  const prog = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId }, select: { id: true, nome: true } })
  if (!prog) throw httpErr(404, 'Curso não encontrado.')
  const exameId = qs(req.query.exameId)
  const [cfg, exames, alunos] = await Promise.all([getConfig(tenantId), exameIdsDe(tenantId, exameId), alunosDoCurso(tenantId, programId)])
  const meds = await mediasPorAluno(tenantId, alunos, exames)
  const prontidao = indiceProntidao(meds, { meta: cfg.metaProntidaoPct, limiteRisco: cfg.limiteRiscoPct })
  const sess = await sessoesConcluidas(tenantId, { studentIds: alunos, exameId: exameId })
  const sessEx = exameId ? sess : sess.filter((s) => exames.includes(s.simulado.exameId))
  const agg = agregarSessoes(sessEx)
  const faixas = { '0-30': 0, '30-50': 0, '50-70': 0, '70-100': 0 }
  for (const m of meds) if (m.media != null) faixas[m.media < 30 ? '0-30' : m.media < 50 ? '30-50' : m.media < 70 ? '50-70' : '70-100']++
  // evolução mensal
  const porMes = new Map<string, number[]>()
  for (const s of sessEx) { const k = (s.enviadaEm ?? s.iniciadaEm).toISOString().slice(0, 7); porMes.set(k, [...(porMes.get(k) ?? []), s.percentual ?? 0]) }
  const evolucao = [...porMes.entries()].sort().map(([mes, v]) => ({ mes, media: round(v.reduce((a, b) => a + b, 0) / v.length), sessoes: v.length }))
  // calendário e obrigados (inscrições do módulo desempenho)
  const agora = new Date()
  const edicoes = await prisma.desEdicao.findMany({ where: { tenantId, exameId: { in: exames }, status: { notIn: ['CANCELADA'] }, OR: [{ dataProva: { gte: new Date(agora.getTime() - 7 * DAY) } }, { dataProva: null }] }, orderBy: { dataProva: 'asc' }, take: 10, include: { exame: { select: { nome: true, tipo: true } } } })
  const edicaoRef = edicoes.find((e) => e.exame.tipo === 'ENADE') ?? edicoes[0]
  let obrigados: any = null
  if (edicaoRef) {
    const insc = await prisma.desInscricao.findMany({ where: { tenantId, edicaoId: edicaoRef.id, programId }, select: { studentId: true, categoria: true, situacao: true } })
    const comSim = new Set(meds.filter((m) => m.sessoes > 0).map((m) => m.studentId))
    const conc = insc.filter((i) => i.categoria === 'CONCLUINTE')
    obrigados = {
      edicaoId: edicaoRef.id, edicao: edicaoRef.titulo || String(edicaoRef.ano), total: insc.length, concluintes: conc.length, ingressantes: insc.filter((i) => i.categoria === 'INGRESSANTE').length,
      porSituacao: Object.fromEntries(['PENDENTE', 'INSCRITO', 'REGULAR', 'DISPENSADO', 'IRREGULAR', 'AUSENTE'].map((s) => [s, insc.filter((i) => i.situacao === s).length])),
      concluintesSemSimulado: conc.filter((i) => !comSim.has(i.studentId)).length,
    }
  }
  const emRisco = meds.filter((m) => m.media != null && m.media < cfg.limiteRiscoPct)
  const nomes = await nomesAlunos(tenantId, emRisco.map((m) => m.studentId))
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'VER_PAINEL_COORDENACAO', refType: 'AcademicProgram', refId: programId })
  res.json({
    curso: prog, config: { metaProntidaoPct: cfg.metaProntidaoPct, limiteRiscoPct: cfg.limiteRiscoPct },
    prontidao, distribuicao: faixas, eixos: agg.porEixo.map((e) => ({ ...e })).sort((a, b) => (a.percentual ?? 0) - (b.percentual ?? 0)),
    temasCriticos: agg.porTema.filter((t) => t.total >= 4).sort((a, b) => (a.percentual ?? 0) - (b.percentual ?? 0)).slice(0, 8), evolucao,
    calendario: edicoes.map((e) => ({ id: e.id, exame: e.exame.nome, titulo: e.titulo, dataProva: e.dataProva, inscricaoFim: e.inscricaoFim, status: e.status, diasParaProva: e.dataProva ? Math.ceil((e.dataProva.getTime() - agora.getTime()) / DAY) : null })),
    obrigados,
    alunosEmRisco: emRisco.sort((a, b) => (a.media ?? 0) - (b.media ?? 0)).slice(0, 15).map((m) => ({ studentId: m.studentId, aluno: nomes.get(m.studentId)?.nome ?? null, ra: nomes.get(m.studentId)?.ra ?? null, media: m.media, sessoes: m.sessoes })),
    aviso: 'O índice de prontidão é um indicador interno de treino (desempenho 60%, participação 25%, alunos fora do risco 15%). Não é o conceito ENADE nem o CPC oficial.',
  })
}))

router.get('/coordenacao/alunos', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const programId = qs(req.query.programId)
  if (!programId) throw httpErr(400, 'Informe programId.')
  const cfg = await getConfig(tenantId)
  const exames = await exameIdsDe(tenantId, qs(req.query.exameId))
  const alunos = await alunosDoCurso(tenantId, programId)
  const [meds, nomes] = await Promise.all([mediasPorAluno(tenantId, alunos, exames), nomesAlunos(tenantId, alunos)])
  const filtro = qs(req.query.situacao)
  let itens = meds.map((m) => ({ studentId: m.studentId, aluno: nomes.get(m.studentId)?.nome ?? null, ra: nomes.get(m.studentId)?.ra ?? null, media: m.media, sessoes: m.sessoes, ultimaSessao: m.ultima, situacao: m.sessoes === 0 ? 'SEM_SIMULADO' : (m.media as number) < cfg.limiteRiscoPct ? 'RISCO' : (m.media as number) >= cfg.metaProntidaoPct ? 'NA_META' : 'ATENCAO' }))
  if (filtro) itens = itens.filter((i) => i.situacao === filtro.toUpperCase())
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'LISTAR_ALUNOS_PREPARACAO', refType: 'AcademicProgram', refId: programId })
  res.json({ total: itens.length, items: itens.sort((a, b) => (a.media ?? -1) - (b.media ?? -1)) })
}))

router.get('/coordenacao/obrigados', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const edicaoId = qs(req.query.edicaoId), programId = qs(req.query.programId)
  if (!edicaoId) throw httpErr(400, 'Informe edicaoId (cadastre edições e gere os inscritos em Desempenho > Exames e inscrições).')
  const ed = await prisma.desEdicao.findFirst({ where: { id: edicaoId, tenantId }, include: { exame: { select: { nome: true } } } })
  if (!ed) throw httpErr(404, 'Edição não encontrada.')
  const insc = await prisma.desInscricao.findMany({ where: { tenantId, edicaoId, ...(programId ? { programId } : {}) }, take: 2000 })
  const ids = insc.map((i) => i.studentId)
  const [nomes, meds] = await Promise.all([nomesAlunos(tenantId, ids), mediasPorAluno(tenantId, ids, [ed.exameId])])
  const mm = new Map(meds.map((m) => [m.studentId, m]))
  res.json({ edicao: { id: ed.id, exame: ed.exame.nome, titulo: ed.titulo, dataProva: ed.dataProva }, total: insc.length, items: insc.map((i) => ({ studentId: i.studentId, aluno: nomes.get(i.studentId)?.nome ?? null, ra: nomes.get(i.studentId)?.ra ?? null, categoria: i.categoria, situacao: i.situacao, media: mm.get(i.studentId)?.media ?? null, sessoes: mm.get(i.studentId)?.sessoes ?? 0 })) })
}))

// Lembretes: avisa alunos (in-app) sobre prazos, inscrição e preparação.
router.post('/coordenacao/lembretes', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const b = parseBody(z.object({ programId: z.string(), exameId: opt(z.string()), edicaoId: opt(z.string()), publico: z.enum(['risco', 'sem_simulado', 'obrigados', 'todos']).default('risco'), mensagem: opt(z.string().max(500)) }), req.body)
  if (!(await prisma.academicProgram.findFirst({ where: { id: b.programId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Curso não encontrado.')
  const cfg = await getConfig(tenantId)
  const exames = await exameIdsDe(tenantId, b.exameId ?? undefined)
  const alunos = await alunosDoCurso(tenantId, b.programId)
  const meds = await mediasPorAluno(tenantId, alunos, exames)
  let alvo = new Set(alunos)
  if (b.publico === 'risco') alvo = new Set(meds.filter((m) => m.media != null && m.media < cfg.limiteRiscoPct).map((m) => m.studentId))
  else if (b.publico === 'sem_simulado') alvo = new Set(meds.filter((m) => m.sessoes === 0).map((m) => m.studentId))
  else if (b.publico === 'obrigados') {
    if (!b.edicaoId) throw httpErr(400, 'Informe edicaoId para o público "obrigados".')
    alvo = new Set((await prisma.desInscricao.findMany({ where: { tenantId, edicaoId: b.edicaoId, programId: b.programId, situacao: { in: ['PENDENTE', 'INSCRITO'] } }, select: { studentId: true } })).map((i) => i.studentId))
  }
  const ed = b.edicaoId ? await prisma.desEdicao.findFirst({ where: { id: b.edicaoId, tenantId } }) : null
  const nomes = await nomesAlunos(tenantId, [...alvo])
  const texto = b.mensagem?.trim() || `Faça um simulado de preparação no EduMaster (ENADE · ENAMED · OAB)${ed?.dataProva ? ` — a prova é em ${ed.dataProva.toLocaleDateString('pt-BR')}` : ''}. Treinar um pouco por dia melhora o resultado.`
  let enviados = 0
  for (const lote of chunk([...alvo], 50)) await Promise.all(lote.map(async (studentId) => { await notify({ tenantId, studentId, userId: nomes.get(studentId)?.userId, assunto: 'Preparação para o exame', mensagem: texto, refType: 'ExaPreparacao', refId: b.programId, templateKey: 'exames.lembrete' }); enviados++ }))
  await audit({ tenantId, userId: getUserId(req), modulo: MOD, acao: 'ENVIAR_LEMBRETES', refType: 'AcademicProgram', refId: b.programId, detalhes: { publico: b.publico, enviados } })
  res.json({ enviados, publico: b.publico })
}))

// Visão comparativa de todos os cursos (reitoria/coordenação geral)
router.get('/coordenacao/cursos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const progs = await prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true }, take: 100, orderBy: { nome: 'asc' } })
  const out: any[] = []
  for (const p of progs) out.push({ programId: p.id, curso: p.nome, ...(await prontidaoEnade(tenantId, p.id)) })
  res.json({ items: out })
}))

export default router
