import { Router, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, requireRole } from '../academico/middleware'
import { qs } from '../core/crud'
import { scheduleReminder } from '../core/reminders'
import { getBranding, brandHeaderHtml, escapeHtml as esc } from '../core/branding'
import { MOD, GESTAO, DOCENTE, httpErr, isStudent, alunosDaTurma, alunosDoCurso, nomesAlunos, media } from './common'
import { ultimasTentativas, desempenhoEixos, agregarPorEixo } from './analise'
import { priorizarLacunas, estimarConceitoEnade, projecaoOAB, projetarTendencia, calcularRisco, mapaCalor, round, Lacuna } from './logic'

const router = Router()
const DAY = 86_400_000

async function getExame(tenantId: string, id: string | undefined) {
  if (!id) throw httpErr(400, 'Informe exameId.')
  const ex = await prisma.desExame.findFirst({ where: { id, tenantId } })
  if (!ex) throw httpErr(404, 'Exame não encontrado.')
  return ex
}
function projecao(ex: { tipo: string; notaCorte: number | null }, pct: number | null) {
  if (pct == null) return null
  if (ex.tipo === 'ENADE') return { ...estimarConceitoEnade(pct), rotulo: 'ESTIMATIVA' }
  return { ...projecaoOAB(pct, ex.notaCorte ?? 50), rotulo: 'ESTIMATIVA' }
}

// Visão consolidada de um conjunto de alunos
export async function analisarGrupo(tenantId: string, ex: { id: string; tipo: string; notaCorte: number | null }, studentIds: string[] | undefined) {
  const [tent, d] = await Promise.all([ultimasTentativas(tenantId, ex.id, studentIds), desempenhoEixos(tenantId, ex.id, studentIds)])
  const pcts = tent.map((t) => t.percentual ?? 0)
  const media_ = media(pcts)
  const faixas = { '0-30': 0, '30-50': 0, '50-70': 0, '70-100': 0 }
  for (const p of pcts) faixas[p < 30 ? '0-30' : p < 50 ? '30-50' : p < 70 ? '50-70' : '70-100']++
  const corte = ex.notaCorte ?? 50
  return {
    alunosNoEscopo: studentIds?.length ?? null, comSimulado: tent.length, participacaoPercentual: studentIds?.length ? round((tent.length / studentIds.length) * 100) : null,
    mediaPercentual: media_, distribuicao: faixas, acimaDoCortePercentual: tent.length ? round((pcts.filter((p) => p >= corte).length / tent.length) * 100) : null,
    eixos: d.eixos.map((e) => ({ ...e, gap: e.atual == null ? null : round(e.atual - e.meta) })), projecao: projecao(ex, media_), lacunas: priorizarLacunas(d.eixos).filter((l) => l.gap > 0).slice(0, 8),
  }
}

// Histórico: média por simulado em ordem cronológica
async function historico(tenantId: string, exameId: string, studentIds?: string[]) {
  const t = await prisma.desTentativa.findMany({ where: { tenantId, status: { in: ['ENVIADA', 'EXPIRADA'] }, simulado: { exameId }, ...(studentIds ? { studentId: { in: studentIds } } : {}) }, select: { simuladoId: true, percentual: true, enviadaEm: true, simulado: { select: { titulo: true } } } })
  const m = new Map<string, { titulo: string; v: number[]; ult: Date }>()
  for (const x of t) { const c = m.get(x.simuladoId) ?? { titulo: x.simulado.titulo, v: [], ult: x.enviadaEm ?? new Date(0) }; c.v.push(x.percentual ?? 0); if (x.enviadaEm && x.enviadaEm > c.ult) c.ult = x.enviadaEm; m.set(x.simuladoId, c) }
  const serie = [...m.entries()].map(([simuladoId, c]) => ({ simuladoId, titulo: c.titulo, data: c.ult, media: media(c.v), participantes: c.v.length })).sort((a, b) => a.data.getTime() - b.data.getTime())
  return serie.map((s, i) => ({ ...s, variacao: i && s.media != null && serie[i - 1].media != null ? round(s.media - serie[i - 1].media!) : null }))
}

router.get('/painel/curso/:programId', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const programId = String(req.params.programId)
  const prog = await prisma.academicProgram.findFirst({ where: { id: programId, tenantId } })
  if (!prog) throw httpErr(404, 'Curso não encontrado.')
  const alunos = await alunosDoCurso(tenantId, programId)
  const [a, hist, meta] = await Promise.all([analisarGrupo(tenantId, ex, alunos), historico(tenantId, ex.id, alunos), prisma.desMetaCurso.findFirst({ where: { tenantId, programId, exameId: ex.id }, orderBy: { ano: 'desc' } })])
  res.json({ curso: { id: prog.id, nome: prog.nome }, exame: { id: ex.id, nome: ex.nome, tipo: ex.tipo }, ...a, meta: meta ? { ano: meta.ano, metaAcerto: meta.metaAcerto, conceitoAlvo: meta.conceitoAlvo, distanciaPontos: a.mediaPercentual == null ? null : round(a.mediaPercentual - meta.metaAcerto) } : null, historico: hist, tendencia: projetarTendencia(hist.map((h) => h.media ?? 0)) })
}))

router.get('/painel/turma/:classSectionId', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const turma = await prisma.classSection.findFirst({ where: { id: String(req.params.classSectionId), tenantId }, include: { discipline: { select: { nome: true } } } })
  if (!turma) throw httpErr(404, 'Turma não encontrada.')
  if (String(req.user?.role).toUpperCase() === 'TEACHER' && turma.professorUserId !== req.user?.id) throw httpErr(403, 'Turma de outro professor.')
  const alunos = await alunosDaTurma(tenantId, turma.id)
  const [a, hist] = await Promise.all([analisarGrupo(tenantId, ex, alunos), historico(tenantId, ex.id, alunos)])
  const entregas = await prisma.desEntrega.groupBy({ by: ['status'], where: { tenantId, atribuicao: { classSectionId: turma.id } }, _count: { _all: true }, _avg: { nota: true } })
  res.json({ turma: { id: turma.id, nome: turma.nome, disciplina: turma.discipline?.nome }, exame: { id: ex.id, nome: ex.nome }, ...a, historico: hist, atividades: entregas.map((e) => ({ status: e.status, quantidade: e._count._all, notaMedia: e._avg.nota == null ? null : round(e._avg.nota) })) })
}))

router.get('/painel/aluno/:studentId', requireRole('STUDENT', ...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const studentId = String(req.params.studentId)
  if (isStudent(req) && req.user?.studentId !== studentId) throw httpErr(403, 'Sem permissão.')
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const [a, tent, trilha, nomes, entregas] = await Promise.all([
    analisarGrupo(tenantId, ex, [studentId]),
    prisma.desTentativa.findMany({ where: { tenantId, studentId, status: { in: ['ENVIADA', 'EXPIRADA'] }, simulado: { exameId: ex.id } }, orderBy: { enviadaEm: 'asc' }, select: { percentual: true, enviadaEm: true, simulado: { select: { titulo: true } } } }),
    prisma.desTrilha.findFirst({ where: { tenantId, studentId, exameId: ex.id, status: { in: ['ATIVA', 'PAUSADA'] } }, select: { id: true, progresso: true, metaPercentual: true, metaData: true } }),
    nomesAlunos(tenantId, [studentId]),
    prisma.desEntrega.findMany({ where: { tenantId, studentId }, include: { atribuicao: { select: { prazo: true } } } }),
  ])
  const serie = tent.map((t) => t.percentual ?? 0)
  const atrasadas = entregas.filter((e) => !e.entregueEm && e.atribuicao.prazo < new Date()).length
  res.json({
    aluno: nomes.get(studentId) ?? null, exame: { id: ex.id, nome: ex.nome }, ...a,
    evolucao: tent.map((t) => ({ simulado: t.simulado.titulo, data: t.enviadaEm, percentual: t.percentual })), tendencia: projetarTendencia(serie),
    risco: calcularRisco({ percentual: serie.length ? serie[serie.length - 1] : null, meta: trilha?.metaPercentual ?? ex.notaCorte ?? 60, tendencia: serie.length > 1 ? serie[serie.length - 1] - serie[serie.length - 2] : null, entregasAtrasadas: atrasadas }),
    trilha, atividades: { total: entregas.length, entregues: entregas.filter((e) => e.entregueEm).length, atrasadas, notaMedia: media(entregas.filter((e) => e.nota != null).map((e) => e.nota!)) },
  })
}))

// Mapa de calor eixo × turma
router.get('/painel/mapa-calor', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const programId = qs(req.query.programId)
  const alunos = programId ? await alunosDoCurso(tenantId, programId) : undefined
  const tent = await ultimasTentativas(tenantId, ex.id, alunos)
  if (!tent.length) return res.json({ eixos: [], linhas: [], observacao: 'Sem simulados concluídos.' })
  const vinculos = await prisma.classSectionEnrollment.findMany({ where: { classSection: { tenantId }, enrollment: { studentId: { in: tent.map((t) => t.studentId) }, status: 'ATIVA' } }, select: { classSection: { select: { id: true, nome: true } }, enrollment: { select: { studentId: true } } } })
  const porAluno = new Map<string, Array<{ id: string; nome: string }>>()
  for (const v of vinculos) { const l = porAluno.get(v.enrollment.studentId) ?? []; l.push(v.classSection); porAluno.set(v.enrollment.studentId, l) }
  const pontos: Array<{ linha: string; eixoId: string; acertos: number; total: number }> = []
  for (const t of tent) for (const turma of porAluno.get(t.studentId) ?? [{ id: 'sem', nome: 'Sem turma' }]) for (const e of (t.porEixo as any[]) ?? []) pontos.push({ linha: turma.nome, eixoId: e.eixoId, acertos: e.acertos, total: e.total })
  const eixos = await prisma.desEixo.findMany({ where: { tenantId, exameId: ex.id, ativo: true }, orderBy: { ordem: 'asc' }, select: { id: true, nome: true, codigo: true, metaAcerto: true } })
  res.json({ eixos, linhas: mapaCalor(pontos), escala: { vermelho: '<40', amarelo: '40-60', verde: '>60' } })
}))

router.get('/painel/evolucao', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const programId = qs(req.query.programId), turmaId = qs(req.query.classSectionId)
  const alunos = turmaId ? await alunosDaTurma(tenantId, turmaId) : programId ? await alunosDoCurso(tenantId, programId) : undefined
  res.json({ historico: await historico(tenantId, ex.id, alunos) })
}))

// Ranking de risco (alunos)
export async function rankingRisco(tenantId: string, ex: { id: string; notaCorte: number | null }, studentIds: string[]) {
  const t = await prisma.desTentativa.findMany({ where: { tenantId, studentId: { in: studentIds }, status: { in: ['ENVIADA', 'EXPIRADA'] }, simulado: { exameId: ex.id } }, orderBy: { enviadaEm: 'asc' }, select: { studentId: true, percentual: true } })
  const por = new Map<string, number[]>()
  for (const x of t) (por.get(x.studentId) ?? por.set(x.studentId, []).get(x.studentId)!).push(x.percentual ?? 0)
  const ent = await prisma.desEntrega.findMany({ where: { tenantId, studentId: { in: studentIds }, entregueEm: null, atribuicao: { status: 'ABERTA', prazo: { lt: new Date() } } }, select: { studentId: true } })
  const atras = new Map<string, number>()
  for (const e of ent) atras.set(e.studentId, (atras.get(e.studentId) ?? 0) + 1)
  const meta = ex.notaCorte ?? 60
  const nomes = await nomesAlunos(tenantId, studentIds)
  return studentIds.map((id) => {
    const s = por.get(id) ?? []
    const r = calcularRisco({ percentual: s.length ? s[s.length - 1] : null, meta, tendencia: s.length > 1 ? s[s.length - 1] - s[s.length - 2] : null, entregasAtrasadas: atras.get(id) ?? 0 })
    return { studentId: id, aluno: nomes.get(id) ?? null, ultimoPercentual: s.length ? s[s.length - 1] : null, simulados: s.length, ...r }
  }).sort((a, b) => b.score - a.score)
}
router.get('/painel/risco', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const programId = qs(req.query.programId), turmaId = qs(req.query.classSectionId)
  if (!programId && !turmaId) throw httpErr(400, 'Informe programId ou classSectionId.')
  const alunos = turmaId ? await alunosDaTurma(tenantId, turmaId) : await alunosDoCurso(tenantId, programId!)
  const r = await rankingRisco(tenantId, ex, alunos.slice(0, 2000))
  const lim = Math.min(200, Number(qs(req.query.limite)) || 50)
  res.json({ total: r.length, porNivel: r.reduce((m: Record<string, number>, x) => ((m[x.nivel] = (m[x.nivel] ?? 0) + 1), m), {}), ranking: r.slice(0, lim) })
}))

// Disciplinas mais impactantes: eixo com maior (gap × peso) -> disciplinas dos itens do banco -> professores das turmas
export async function disciplinasImpacto(tenantId: string, exameId: string, studentIds: string[] | undefined, lacunas: Lacuna[]) {
  const top = lacunas.filter((l) => l.gap > 0).slice(0, 5)
  if (!top.length) return []
  const vinc = await prisma.desQuestao.groupBy({ by: ['eixoId', 'disciplineId'], where: { tenantId, exameId, eixoId: { in: top.map((t) => t.eixoId) }, disciplineId: { not: null } }, _count: { _all: true } })
  const out: Array<{ eixoId: string; eixo?: string; prioridade: number; gap: number; disciplineId: string; disciplina?: string; professores: string[]; questoesVinculadas: number }> = []
  const discIds = [...new Set(vinc.map((v) => v.disciplineId!))]
  const discs = await prisma.discipline.findMany({ where: { tenantId, id: { in: discIds } }, select: { id: true, nome: true } })
  const dn = new Map(discs.map((d) => [d.id, d.nome]))
  const secs = await prisma.classSection.findMany({ where: { tenantId, disciplineId: { in: discIds }, ...(studentIds ? { matriculados: { some: { enrollment: { studentId: { in: studentIds } } } } } : {}) }, select: { disciplineId: true, professorUserId: true }, take: 1000 })
  for (const l of top) {
    const ds = vinc.filter((v) => v.eixoId === l.eixoId).sort((a, b) => b._count._all - a._count._all).slice(0, 2)
    for (const v of ds) out.push({ eixoId: l.eixoId, eixo: l.nome, prioridade: l.prioridade, gap: l.gap, disciplineId: v.disciplineId!, disciplina: dn.get(v.disciplineId!), professores: [...new Set(secs.filter((s) => s.disciplineId === v.disciplineId).map((s) => s.professorUserId))], questoesVinculadas: v._count._all })
  }
  return out.sort((a, b) => b.prioridade - a.prioridade)
}
router.get('/painel/disciplinas-impacto', requireRole(...DOCENTE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const programId = qs(req.query.programId)
  const alunos = programId ? await alunosDoCurso(tenantId, programId) : undefined
  const d = await desempenhoEixos(tenantId, ex.id, alunos)
  const lac = priorizarLacunas(d.eixos)
  res.json({ amostra: d.amostra, itens: await disciplinasImpacto(tenantId, ex.id, alunos, lac) })
}))

// Alertas ao coordenador e professores das disciplinas mais impactantes (deduplicados por semana)
export async function gerarAlertas(tenantId: string, exameId: string, programId?: string) {
  const ex = await prisma.desExame.findFirst({ where: { id: exameId, tenantId } })
  if (!ex) return { alertas: 0 }
  const alunos = programId ? await alunosDoCurso(tenantId, programId) : undefined
  const d = await desempenhoEixos(tenantId, exameId, alunos)
  if (d.amostra < 5) return { alertas: 0, motivo: 'amostra insuficiente' }
  const lac = priorizarLacunas(d.eixos)
  const impacto = await disciplinasImpacto(tenantId, exameId, alunos, lac)
  const semana = Math.floor(Date.now() / (7 * DAY))
  const escopo = programId ?? 'geral'
  let alertas = 0
  const due = new Date(Date.now() + 14 * DAY)
  for (const l of lac.filter((x) => x.gap >= 10).slice(0, 3)) {
    await scheduleReminder({ tenantId, modulo: MOD, titulo: `${ex.nome}: eixo "${l.nome}" ${round(l.gap)} p.p. abaixo da meta`, descricao: `Desempenho atual ${l.atual ?? 0}% (meta ${l.meta}%). Amostra: ${d.amostra} aluno(s). Planeje reforço/atividades.`, dueAt: due, remindAt: new Date(), severity: l.gap >= 25 ? 'CRITICO' : 'ATENCAO', assigneeRole: 'COORDINATOR', refType: 'DesEixo', refId: l.eixoId, dedupeKey: `des:alerta:${escopo}:${l.eixoId}:${semana}:coord` })
    alertas++
  }
  for (const im of impacto.filter((i) => i.gap >= 10)) for (const prof of im.professores) {
    await scheduleReminder({ tenantId, modulo: MOD, titulo: `Reforçar "${im.eixo}" na disciplina ${im.disciplina ?? ''}`, descricao: `Os alunos estão ${round(im.gap)} p.p. abaixo da meta neste eixo (${ex.nome}). Sugestão: atribuir um kit de atividades à turma.`, dueAt: due, remindAt: new Date(), severity: 'ATENCAO', assigneeUserId: prof, refType: 'DesEixo', refId: im.eixoId, dedupeKey: `des:alerta:${escopo}:${im.eixoId}:${im.disciplineId}:${semana}:prof:${prof}` })
    alertas++
  }
  return { alertas }
}
router.post('/painel/alertas/disparar', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  res.json(await gerarAlertas(getTenantId(req), String(req.body?.exameId ?? ''), req.body?.programId ? String(req.body.programId) : undefined))
}))

// ---------- Relatório regulatório / coordenação (HTML) ----------
const cor = (v: number | null, meta: number) => (v == null ? '#94a3b8' : v >= meta ? '#16a34a' : v >= meta - 15 ? '#d97706' : '#dc2626')
router.get('/relatorios/regulatorio', requireRole(...DOCENTE, 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const ex = await getExame(tenantId, qs(req.query.exameId))
  const programId = qs(req.query.programId)
  const prog = programId ? await prisma.academicProgram.findFirst({ where: { id: programId, tenantId } }) : null
  if (programId && !prog) throw httpErr(404, 'Curso não encontrado.')
  const alunos = programId ? await alunosDoCurso(tenantId, programId) : undefined
  const [b, a, hist, edicao] = await Promise.all([
    getBranding(tenantId), analisarGrupo(tenantId, ex, alunos), historico(tenantId, ex.id, alunos),
    prisma.desEdicao.findFirst({ where: { tenantId, exameId: ex.id }, orderBy: { ano: 'desc' } }),
  ])
  const lac = priorizarLacunas(a.eixos.map((e) => ({ eixoId: e.eixoId, nome: e.nome, peso: e.peso, meta: e.meta, atual: e.atual })))
  const impacto = await disciplinasImpacto(tenantId, ex.id, alunos, lac)
  let insc: any = null
  if (edicao) {
    const g = await prisma.desInscricao.groupBy({ by: ['situacao'], where: { tenantId, edicaoId: edicao.id, ...(programId ? { programId } : {}) }, _count: { _all: true } })
    const tot = g.reduce((s, x) => s + x._count._all, 0), ok = g.filter((x) => ['INSCRITO', 'REGULAR', 'DISPENSADO'].includes(x.situacao)).reduce((s, x) => s + x._count._all, 0)
    insc = { ano: edicao.ano, total: tot, regulares: ok, pendentes: g.filter((x) => ['PENDENTE', 'IRREGULAR'].includes(x.situacao)).reduce((s, x) => s + x._count._all, 0), pct: tot ? round((ok / tot) * 100) : null }
  }
  const pr: any = a.projecao
  const linhasEixo = a.eixos.map((e) => `<tr><td>${esc(e.nome)}</td><td style="text-align:center">${e.peso}</td><td style="text-align:center">${e.meta}%</td><td style="text-align:center;font-weight:700;color:${cor(e.atual, e.meta)}">${e.atual == null ? 's/ dados' : e.atual + '%'}</td><td style="text-align:center">${e.gap == null ? '—' : (e.gap > 0 ? '+' : '') + e.gap}</td></tr>`).join('')
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Desempenho — ${esc(ex.nome)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#0f172a;margin:0;background:#fff}main{max-width:920px;margin:0 auto;padding:24px 28px}h2{color:${esc(b.cores.secundaria)};border-bottom:2px solid ${esc(b.cores.destaque)};padding-bottom:4px;margin-top:28px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #e2e8f0;padding:6px 8px}th{background:#f1f5f9;text-align:left}.kpi{display:inline-block;min-width:150px;margin:4px 8px 4px 0;padding:10px 14px;border:1px solid #e2e8f0;border-radius:10px}.kpi b{display:block;font-size:22px;color:${esc(b.cores.primaria)}}.nota{font-size:11px;color:#64748b;margin-top:24px}@media print{main{padding:0}}</style></head><body>
${brandHeaderHtml(b, { titulo: 'Relatório de Desempenho em Exames', subtitulo: `${ex.nome}${prog ? ' — ' + prog.nome : ' — Instituição'} · emitido em ${new Date().toLocaleDateString('pt-BR')}` })}
<main>
<h2>1. Síntese</h2>
<div class="kpi"><b>${a.comSimulado}</b>alunos com simulado${a.alunosNoEscopo != null ? ` de ${a.alunosNoEscopo}` : ''}</div>
<div class="kpi"><b>${a.mediaPercentual ?? '—'}${a.mediaPercentual != null ? '%' : ''}</b>média de acertos</div>
<div class="kpi"><b>${a.acimaDoCortePercentual ?? '—'}${a.acimaDoCortePercentual != null ? '%' : ''}</b>acima do corte (${ex.notaCorte ?? 50}%)</div>
${pr ? `<div class="kpi"><b>${pr.conceito != null ? 'Conceito ' + pr.conceito : pr.risco}</b>projeção (ESTIMATIVA)</div>` : ''}
${a.participacaoPercentual != null ? `<p>Participação nos simulados: <b>${a.participacaoPercentual}%</b>.</p>` : ''}
<h2>2. Desempenho por eixo/competência</h2>
<table><thead><tr><th>Eixo / competência</th><th>Peso</th><th>Meta</th><th>Atual</th><th>Dif. p.p.</th></tr></thead><tbody>${linhasEixo || '<tr><td colspan="5">Sem eixos configurados.</td></tr>'}</tbody></table>
<h2>3. Evolução entre simulados</h2>
<table><thead><tr><th>Simulado</th><th>Data</th><th>Participantes</th><th>Média</th><th>Variação</th></tr></thead><tbody>${hist.map((h) => `<tr><td>${esc(h.titulo)}</td><td>${h.data.toLocaleDateString('pt-BR')}</td><td>${h.participantes}</td><td>${h.media ?? '—'}%</td><td>${h.variacao ?? '—'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum simulado concluído.</td></tr>'}</tbody></table>
${insc ? `<h2>4. Inscrição e regularidade (edição ${insc.ano})</h2><p>${insc.total} estudante(s) listados; <b>${insc.regulares}</b> regulares (${insc.pct ?? '—'}%); <b>${insc.pendentes}</b> com pendência.</p>` : ''}
<h2>5. Lacunas prioritárias e disciplinas de maior impacto</h2>
<table><thead><tr><th>Eixo</th><th>Gap (p.p.)</th><th>Prioridade</th><th>Disciplina(s) relacionada(s)</th></tr></thead><tbody>${lac.filter((l) => l.gap > 0).slice(0, 6).map((l) => `<tr><td>${esc(l.nome ?? l.eixoId)}</td><td>${l.gap}</td><td>${l.prioridade}</td><td>${esc(impacto.filter((i) => i.eixoId === l.eixoId).map((i) => i.disciplina).filter(Boolean).join(', ') || '—')}</td></tr>`).join('') || '<tr><td colspan="4">Sem lacunas identificadas.</td></tr>'}</tbody></table>
<p class="nota">As projeções de conceito/aprovação são <b>estimativas internas</b> baseadas na proporção de acertos em simulados institucionais e não substituem os resultados oficiais do INEP/OAB/banca. Dados dos alunos que realizaram o simulado mais recente de cada aluno.</p>
</main></body></html>`
  res.type('html').send(html)
}))

export default router
