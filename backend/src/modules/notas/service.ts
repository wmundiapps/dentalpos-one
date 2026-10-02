import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import {
  REGRA_PADRAO, RegraCalc, ComponenteCalc, NotaCalc, calcResultado, calcFrequencia, calcCR, avaliarRisco, notaNecessaria, Situacao, validarNota,
} from './calc'

// Camada de acesso a dados do módulo notas. Funções exportadas aqui são
// usadas por outros módulos (secretaria, desempenho, rei­toria...).

export function regraRowToCalc(r: any): RegraCalc {
  return {
    regraMedia: r.regraMedia, notaMaxima: r.notaMaxima, mediaAprovacao: r.mediaAprovacao, mediaMinimaRecuperacao: r.mediaMinimaRecuperacao,
    recuperacao: r.recuperacao, exame: r.exame, pesoParcial: r.pesoParcial, pesoExame: r.pesoExame, mediaAprovacaoExame: r.mediaAprovacaoExame,
    frequenciaMinima: r.frequenciaMinima, abonaJustificadas: r.abonaJustificadas, arredondamento: r.arredondamento, diasRevisao: r.diasRevisao,
  }
}

export interface RegraResolvida { regra: RegraCalc; regraId: string | null; nome: string; origem: 'TURMA' | 'CURSO' | 'TENANT' | 'PADRAO_SISTEMA'; modeloComponentes: any[] | null }

// Hierarquia: turma > curso > padrão do tenant > qualquer regra ativa do tenant > padrão do sistema.
export async function resolverRegra(tenantId: string, classSectionId: string): Promise<RegraResolvida> {
  const section = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId }, select: { disciplineId: true } })
  const porTurma = await prisma.ntRegraAvaliacao.findFirst({ where: { tenantId, ativo: true, escopo: 'TURMA', classSectionId }, orderBy: { updatedAt: 'desc' } })
  if (porTurma) return pack(porTurma, 'TURMA')
  if (section) {
    const cds = await prisma.curriculumDiscipline.findMany({ where: { disciplineId: section.disciplineId }, select: { programId: true } })
    const programIds = cds.map((c) => c.programId)
    if (programIds.length) {
      const porCurso = await prisma.ntRegraAvaliacao.findFirst({ where: { tenantId, ativo: true, escopo: 'CURSO', programId: { in: programIds } }, orderBy: { updatedAt: 'desc' } })
      if (porCurso) return pack(porCurso, 'CURSO')
    }
  }
  const tenantRegras = await prisma.ntRegraAvaliacao.findMany({ where: { tenantId, ativo: true, escopo: 'TENANT' }, orderBy: [{ padrao: 'desc' }, { updatedAt: 'desc' }], take: 1 })
  if (tenantRegras[0]) return pack(tenantRegras[0], 'TENANT')
  return { regra: { ...REGRA_PADRAO }, regraId: null, nome: 'Padrão do sistema', origem: 'PADRAO_SISTEMA', modeloComponentes: null }
}
function pack(r: any, origem: RegraResolvida['origem']): RegraResolvida {
  return { regra: regraRowToCalc(r), regraId: r.id, nome: r.nome, origem, modeloComponentes: Array.isArray(r.componentes) ? r.componentes : null }
}

export async function getOrCreateDiario(tenantId: string, classSectionId: string) {
  return prisma.ntDiario.upsert({ where: { classSectionId }, create: { tenantId, classSectionId }, update: {} })
}

// Prazo de lançamento: o mais cedo entre o do diário e o do calendário (tabela opcional, tolerante).
export async function getPrazoLancamento(tenantId: string, classSectionId: string, termId?: string | null): Promise<{ prazo: Date | null; origem: string | null }> {
  const cand: Array<{ d: Date; o: string }> = []
  const diario = await prisma.ntDiario.findUnique({ where: { classSectionId } })
  if (diario?.prazoLancamento) cand.push({ d: diario.prazoLancamento, o: 'DIARIO' })
  try {
    const d = (prisma as any).calPrazoNota
    if (d?.findFirst) {
      const or: any[] = [{ classSectionId }]
      if (termId) or.push({ termId })
      const row = await d.findFirst({ where: { tenantId, OR: or }, orderBy: { createdAt: 'desc' } })
      const dt = row && (row.dataLimite ?? row.prazo ?? row.prazoEm ?? row.dataFim ?? row.limite)
      if (dt) cand.push({ d: new Date(dt), o: 'CALENDARIO' })
    }
  } catch { /* módulo calendário ausente ou campos diferentes */ }
  if (!cand.length) return { prazo: null, origem: null }
  cand.sort((a, b) => a.d.getTime() - b.d.getTime())
  return { prazo: cand[0].d, origem: cand[0].o }
}

export interface AlunoRoster { studentId: string; enrollmentId: string; ra: string; nome: string; statusMatricula: string; programId: string }

export async function roster(tenantId: string, classSectionId: string): Promise<AlunoRoster[]> {
  const rows = await prisma.classSectionEnrollment.findMany({
    where: { classSectionId, classSection: { tenantId } },
    include: { enrollment: { include: { student: { select: { id: true, ra: true, nomeCompleto: true, tenantId: true } } } } },
  })
  return rows
    .filter((r) => r.enrollment.student.tenantId === tenantId && ['ATIVA', 'CONCLUIDA'].includes(r.enrollment.status))
    .map((r) => ({ studentId: r.enrollment.studentId, enrollmentId: r.enrollmentId, ra: r.enrollment.student.ra, nome: r.enrollment.student.nomeCompleto, statusMatricula: r.enrollment.status, programId: r.enrollment.programId }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// Consolida presença (Attendance do núcleo) por aluno. Só conta aulas REALIZADAS com chamada feita.
export async function frequenciaTurma(tenantId: string, classSectionId: string, studentIds: string[], abona: boolean) {
  const sessoes = await prisma.classSession.findMany({ where: { classSectionId, status: 'REALIZADA', classSection: { tenantId } }, select: { id: true } })
  const ids = sessoes.map((s) => s.id)
  const att = ids.length ? await prisma.attendance.findMany({ where: { classSessionId: { in: ids }, studentId: { in: studentIds } }, select: { classSessionId: true, studentId: true, presente: true, justificativa: true } }) : []
  const comChamada = new Set(att.map((a) => a.classSessionId))
  const total = comChamada.size
  const por = new Map<string, Array<{ presente: boolean; justificada: boolean }>>()
  for (const a of att) {
    if (!por.has(a.studentId)) por.set(a.studentId, [])
    por.get(a.studentId)!.push({ presente: a.presente, justificada: !!a.justificativa })
  }
  const out = new Map<string, ReturnType<typeof calcFrequencia>>()
  for (const sid of studentIds) out.set(sid, calcFrequencia(total, por.get(sid) ?? [], abona))
  return { aulasChamada: total, aulasRealizadas: ids.length, porAluno: out }
}

export interface TurmaCtx {
  section: { id: string; tenantId: string; nome: string; disciplineId: string; termId: string; professorUserId: string }
  diario: Awaited<ReturnType<typeof getOrCreateDiario>>
  regra: RegraCalc
  regraInfo: Omit<RegraResolvida, 'regra'>
  componentes: any[]
  componentesCalc: ComponenteCalc[]
}

export async function carregarCtx(tenantId: string, classSectionId: string): Promise<TurmaCtx | null> {
  const section = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId }, select: { id: true, tenantId: true, nome: true, disciplineId: true, termId: true, professorUserId: true } })
  if (!section) return null
  const diario = await getOrCreateDiario(tenantId, classSectionId)
  const resolvida = await resolverRegra(tenantId, classSectionId)
  const snap = diario.status === 'FECHADO' && diario.regraSnapshot ? ({ ...REGRA_PADRAO, ...(diario.regraSnapshot as any) } as RegraCalc) : resolvida.regra
  const componentes = await prisma.ntComponente.findMany({ where: { tenantId, classSectionId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }] })
  const { regra: _r, ...info } = resolvida
  return {
    section, diario, regra: snap, regraInfo: info, componentes,
    componentesCalc: componentes.map((c) => ({ id: c.id, codigo: c.codigo, tipo: c.tipo as any, peso: c.peso, notaMaxima: c.notaMaxima, obrigatorio: c.obrigatorio })),
  }
}

export interface AlunoCalculado {
  aluno: AlunoRoster
  notas: Array<{ componenteId: string; valor: number | null; ausente: boolean; origem: string; observacao: string | null; lancamentoId: string }>
  frequencia: ReturnType<typeof calcFrequencia>
  resultado: ReturnType<typeof calcResultado>
  risco: ReturnType<typeof avaliarRisco>
  notaNecessaria: ReturnType<typeof notaNecessaria>
}

// Calcula (sem gravar) o resultado de todos os alunos da turma, ou apenas de `studentIds`.
export async function calcularTurma(tenantId: string, ctx: TurmaCtx, studentIds?: string[]): Promise<{ alunos: AlunoCalculado[]; aulasChamada: number; aulasRealizadas: number }> {
  let alunos = await roster(tenantId, ctx.section.id)
  if (studentIds) alunos = alunos.filter((a) => studentIds.includes(a.studentId))
  const lancs = await prisma.ntLancamento.findMany({ where: { tenantId, classSectionId: ctx.section.id, studentId: { in: alunos.map((a) => a.studentId) } } })
  const freq = await frequenciaTurma(tenantId, ctx.section.id, alunos.map((a) => a.studentId), ctx.regra.abonaJustificadas)
  const encerrado = ctx.diario.status === 'FECHADO'
  const out: AlunoCalculado[] = alunos.map((aluno) => {
    const ls = lancs.filter((l) => l.studentId === aluno.studentId)
    const notasCalc: NotaCalc[] = ls.map((l) => ({ componenteId: l.componenteId, valor: l.valor, ausente: l.ausente }))
    const f = freq.porAluno.get(aluno.studentId)!
    const resultado = calcResultado({ componentes: ctx.componentesCalc, notas: notasCalc, regra: ctx.regra, frequenciaPct: f.pct, encerrado })
    const risco = avaliarRisco({ componentes: ctx.componentesCalc, notas: notasCalc, regra: ctx.regra, frequenciaPct: f.pct, situacao: resultado.situacao })
    return {
      aluno,
      notas: ls.map((l) => ({ componenteId: l.componenteId, valor: l.valor, ausente: l.ausente, origem: l.origem, observacao: l.observacao, lancamentoId: l.id })),
      frequencia: f, resultado, risco, notaNecessaria: notaNecessaria(ctx.componentesCalc, notasCalc, ctx.regra),
    }
  })
  return { alunos: out, aulasChamada: freq.aulasChamada, aulasRealizadas: freq.aulasRealizadas }
}

// Recalcula e persiste NtResultado de toda a turma (consolida frequência + notas).
export async function recalcularTurma(tenantId: string, classSectionId: string) {
  const ctx = await carregarCtx(tenantId, classSectionId)
  if (!ctx) return null
  const calc = await calcularTurma(tenantId, ctx)
  const encerrado = ctx.diario.status === 'FECHADO'
  for (const a of calc.alunos) {
    const data = {
      enrollmentId: a.aluno.enrollmentId, disciplineId: ctx.section.disciplineId, termId: ctx.section.termId,
      mediaParcial: a.resultado.mediaParcial, notaRecuperacao: a.resultado.notaRecuperacao, notaExame: a.resultado.notaExame,
      mediaFinal: a.resultado.mediaFinal, frequenciaPct: a.frequencia.pct, aulasTotal: a.frequencia.total, faltas: a.frequencia.faltas,
      situacao: a.resultado.situacao as any, pendencias: a.resultado.pendentes.length, encerrado, calculadoEm: new Date(),
    }
    await prisma.ntResultado.upsert({
      where: { classSectionId_studentId: { classSectionId, studentId: a.aluno.studentId } },
      create: { tenantId, classSectionId, studentId: a.aluno.studentId, ...data },
      update: data,
    })
  }
  return { ctx, ...calc }
}

export type GravarNotaResult = { changed: boolean; lancamentoId: string }

// Grava/atualiza uma nota com histórico obrigatório. Todas as vias (manual, importação, prova, correção, revisão) passam por aqui.
export async function gravarNota(p: {
  tenantId: string; classSectionId: string; componente: { id: string; notaMaxima: number }; studentId: string
  valor: number | null; ausente?: boolean; observacao?: string | null; origem: 'MANUAL' | 'IMPORTACAO' | 'PROVA' | 'CORRECAO' | 'REVISAO'
  motivo?: string | null; userId?: string; attemptId?: string | null
}): Promise<GravarNotaResult> {
  const ausente = !!p.ausente
  const valor = ausente ? null : p.valor
  if (valor != null) {
    const e = validarNota(valor, p.componente.notaMaxima)
    if (e) throw Object.assign(new Error(e), { status: 400 })
  }
  const ex = await prisma.ntLancamento.findUnique({ where: { componenteId_studentId: { componenteId: p.componente.id, studentId: p.studentId } } })
  if (ex && ex.tenantId !== p.tenantId) throw Object.assign(new Error('Lançamento inválido.'), { status: 404 })
  if (ex && ex.valor === valor && ex.ausente === ausente) return { changed: false, lancamentoId: ex.id }
  const row = ex
    ? await prisma.ntLancamento.update({ where: { id: ex.id }, data: { valor, ausente, origem: p.origem, observacao: p.observacao ?? ex.observacao, attemptId: p.attemptId ?? ex.attemptId, lancadoPorId: p.userId } })
    : await prisma.ntLancamento.create({ data: { tenantId: p.tenantId, classSectionId: p.classSectionId, componenteId: p.componente.id, studentId: p.studentId, valor, ausente, origem: p.origem, observacao: p.observacao, attemptId: p.attemptId, lancadoPorId: p.userId } })
  await prisma.ntLancamentoHistorico.create({
    data: {
      tenantId: p.tenantId, lancamentoId: row.id, classSectionId: p.classSectionId, studentId: p.studentId, componenteId: p.componente.id,
      valorAnterior: ex?.valor ?? null, valorNovo: valor, ausenteAnterior: ex?.ausente ?? null, ausenteNovo: ausente,
      origem: p.origem, motivo: p.motivo ?? null, usuarioId: p.userId,
    },
  })
  if (ex && (p.origem === 'CORRECAO' || p.origem === 'REVISAO')) {
    await audit({ tenantId: p.tenantId, userId: p.userId, modulo: 'notas', acao: p.origem === 'REVISAO' ? 'NOTA_REVISADA' : 'NOTA_CORRIGIDA', refType: 'NtLancamento', refId: row.id, detalhes: { de: ex.valor, para: valor, motivo: p.motivo, studentId: p.studentId } })
  }
  return { changed: true, lancamentoId: row.id }
}

// ---------------- Boletim e histórico ----------------

async function userNames(ids: string[]) {
  const us = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : []
  return new Map(us.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]))
}

export async function turmasDoAluno(tenantId: string, studentId: string, termId?: string) {
  return prisma.classSectionEnrollment.findMany({
    where: { enrollment: { studentId, student: { tenantId } }, classSection: { tenantId, ...(termId ? { termId } : {}) } },
    include: { classSection: { include: { discipline: { select: { id: true, nome: true, cargaHoraria: true } }, term: { select: { id: true, codigo: true, dataInicio: true, dataFim: true } } } }, enrollment: { select: { id: true, programId: true, status: true } } },
  })
}

export async function getBoletimAluno(tenantId: string, studentId: string, termId?: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, ra: true, nomeCompleto: true, status: true } })
  if (!student) return null
  const vinc = await turmasDoAluno(tenantId, studentId, termId)
  const nomes = await userNames([...new Set(vinc.map((v) => v.classSection.professorUserId))])
  const disciplinas: any[] = []
  for (const v of vinc) {
    const ctx = await carregarCtx(tenantId, v.classSectionId)
    if (!ctx) continue
    const calc = await calcularTurma(tenantId, ctx, [studentId])
    const a = calc.alunos[0]
    if (!a) continue
    disciplinas.push({
      classSectionId: v.classSectionId, turma: v.classSection.nome, disciplina: v.classSection.discipline.nome, disciplineId: v.classSection.disciplineId,
      cargaHoraria: v.classSection.discipline.cargaHoraria, periodoLetivo: v.classSection.term.codigo, termId: v.classSection.termId,
      professor: nomes.get(v.classSection.professorUserId) ?? null, diarioStatus: ctx.diario.status,
      regra: { mediaAprovacao: ctx.regra.mediaAprovacao, frequenciaMinima: ctx.regra.frequenciaMinima, regraMedia: ctx.regra.regraMedia },
      componentes: ctx.componentes.map((c) => {
        const n = a.notas.find((x) => x.componenteId === c.id)
        return { id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, peso: c.peso, notaMaxima: c.notaMaxima, dataPrevista: c.dataPrevista, valor: n?.valor ?? null, ausente: n?.ausente ?? false, lancamentoId: n?.lancamentoId ?? null }
      }),
      mediaParcial: a.resultado.mediaParcial, mediaFinal: a.resultado.mediaFinal, situacao: a.resultado.situacao,
      frequenciaPct: a.frequencia.pct, faltas: a.frequencia.faltas, aulasTotal: a.frequencia.total,
      notaNecessaria: a.notaNecessaria, risco: a.risco,
    })
  }
  const cr = calcCR(disciplinas.map((d) => ({ mediaFinal: d.mediaFinal, cargaHoraria: d.cargaHoraria, situacao: d.situacao as Situacao })))
  return { aluno: student, periodo: termId ?? null, disciplinas, crPeriodo: cr }
}

export async function getHistoricoAluno(tenantId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId }, select: { id: true, ra: true, nomeCompleto: true, cpf: true, dataNascimento: true, status: true } })
  if (!student) return null
  const vinc = await turmasDoAluno(tenantId, studentId)
  const programIds = [...new Set(vinc.map((v) => v.enrollment.programId))]
  const programas = programIds.length ? await prisma.academicProgram.findMany({ where: { tenantId, id: { in: programIds } } }) : []
  const grade = programIds.length ? await prisma.curriculumDiscipline.findMany({ where: { programId: { in: programIds } }, include: { discipline: { select: { id: true, nome: true, cargaHoraria: true } } } }) : []
  const linhas: any[] = []
  for (const v of vinc) {
    const ctx = await carregarCtx(tenantId, v.classSectionId)
    if (!ctx) continue
    const a = (await calcularTurma(tenantId, ctx, [studentId])).alunos[0]
    if (!a) continue
    linhas.push({
      termId: v.classSection.termId, periodoLetivo: v.classSection.term.codigo, inicio: v.classSection.term.dataInicio, programId: v.enrollment.programId,
      disciplineId: v.classSection.disciplineId, disciplina: v.classSection.discipline.nome, cargaHoraria: v.classSection.discipline.cargaHoraria,
      mediaFinal: a.resultado.mediaFinal, frequenciaPct: a.frequencia.pct, situacao: a.resultado.situacao, encerrado: ctx.diario.status === 'FECHADO',
    })
  }
  linhas.sort((x, y) => new Date(x.inicio).getTime() - new Date(y.inicio).getTime() || x.disciplina.localeCompare(y.disciplina))
  const periodos = [...new Set(linhas.map((l) => l.periodoLetivo))].map((p) => {
    const ls = linhas.filter((l) => l.periodoLetivo === p)
    return { periodoLetivo: p, disciplinas: ls, cr: calcCR(ls) }
  })
  const aprovadas = new Set(linhas.filter((l) => l.situacao === 'APROVADO').map((l) => l.disciplineId))
  const chIntegralizada = [...aprovadas].reduce((s, id) => s + (linhas.find((l) => l.disciplineId === id)?.cargaHoraria ?? 0), 0)
  const matrizTotal = programas.reduce((s, p) => s + p.cargaHorariaTotal, 0)
  const obrigatorias = grade.filter((g) => g.obrigatoria)
  const faltantes = obrigatorias.filter((g) => !aprovadas.has(g.disciplineId)).map((g) => ({ disciplineId: g.disciplineId, disciplina: g.discipline.nome, periodo: g.periodo, cargaHoraria: g.discipline.cargaHoraria }))
  return {
    aluno: student, programas: programas.map((p) => ({ id: p.id, nome: p.nome, modalidade: p.modalidade, cargaHorariaTotal: p.cargaHorariaTotal })),
    periodos, crGeral: calcCR(linhas),
    cargaHoraria: { integralizada: chIntegralizada, matriz: matrizTotal, percentual: matrizTotal ? Math.round((chIntegralizada / matrizTotal) * 1000) / 10 : null },
    disciplinasAprovadas: aprovadas.size, obrigatoriasPendentes: faltantes,
  }
}

// CR atual do aluno (para outros módulos: desempenho, secretaria, reitoria).
export async function calcularCRAluno(tenantId: string, studentId: string): Promise<number | null> {
  const h = await getHistoricoAluno(tenantId, studentId)
  return h?.crGeral ?? null
}
