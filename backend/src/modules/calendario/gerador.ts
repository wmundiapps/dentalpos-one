import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { GenCelula, GenDemanda, GenGrupo, GenInput, GenProfessor, GenEspaco, GenOcupado, Faixa, gerarCronograma, verificarResultado } from './scheduler'
import { DIAS_SEMANA, isoWeekday, minToHHMM, toLocal } from './time'
import { GESTAO, MODULO, carregarMalha, diasLetivosDoPeriodo, erro, nomesDisciplinas, nomesUsuarios, requireTerm, toStrArray, carregarEspacos } from './service'
import { configDisciplina, resolverTurmas, TurmaInfo } from './turmas'
import { varrerGrade } from './grade'

export const paramsGerador = z.object({
  termId: z.string().min(1),
  programId: z.string().optional(),
  campusId: z.string().optional(),
  periodos: z.array(z.number().int().min(1).max(30)).max(30).optional(),
  classSectionIds: z.array(z.string()).max(2000).optional(),
  dias: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5]),
  turnos: z.array(z.enum(['MANHA', 'TARDE', 'NOITE'])).optional(),
  semanasLetivas: z.number().int().min(1).max(60).optional(),
  horaAulaMin: z.number().int().min(20).max(120).optional(),
  cargaEmHoraRelogio: z.boolean().default(true),
  preservarManuais: z.boolean().default(true),
  substituirGerados: z.boolean().default(true),
  considerarReservas: z.boolean().default(true),
  maxAulasGrupoDia: z.number().int().min(1).max(12).default(6),
  maxMs: z.number().int().min(200).max(20000).default(5000),
  maxNos: z.number().int().min(100).max(500000).default(40000),
  beam: z.number().int().min(1).max(40).default(12),
  permitirPendencias: z.boolean().default(true),
  notificarProfessores: z.boolean().default(true),
})
export type ParamsGerador = z.infer<typeof paramsGerador>

export interface DemandaInfo extends TurmaInfo {
  disciplina: string
  disciplina_cargaHoraria: number
  professorId: string
  aulasSemanaTotal: number
  cfg: { blocoMax: number; pratica: boolean; tiposEspaco: string[]; recursos: string[]; capacidadeMinima: number | null; espacoFixoId: string | null; online: boolean }
}

/** Carrega as turmas do período e calcula a carga semanal (aulas) de cada uma. */
export async function carregarDemandas(tenantId: string, termId: string, p: Partial<ParamsGerador>) {
  const term = await requireTerm(tenantId, termId)
  const malha = await carregarMalha(tenantId)
  const duracoes = malha.map((m) => m.fimMin - m.inicioMin)
  const moda = duracoes.sort((a, b) => a - b)[Math.floor(duracoes.length / 2)] || 50
  const duracaoAulaMin = p.horaAulaMin ?? moda
  const sections = await prisma.classSection.findMany({
    where: { tenantId, termId, ...(p.campusId ? { OR: [{ campusId: null }, { campusId: p.campusId }] } : {}), ...(p.classSectionIds?.length ? { id: { in: p.classSectionIds } } : {}) },
    take: 3000,
  })
  const info = await resolverTurmas(tenantId, sections)
  const discs = await prisma.discipline.findMany({ where: { tenantId, id: { in: [...new Set(sections.map((s) => s.disciplineId))] } } })
  const dm = new Map(discs.map((d) => [d.id, d]))
  const cfg = await configDisciplina(tenantId, discs.map((d) => d.id))
  const dl = await diasLetivosDoPeriodo(tenantId, termId, { campusId: p.campusId, programId: p.programId, diasSemana: p.dias })
  const semanas = Math.max(1, p.semanasLetivas ?? dl.semanasLetivas ?? 1)
  const lista: DemandaInfo[] = []
  for (const s of sections) {
    const i = info.get(s.id)!
    if (p.programId && i.programId !== p.programId) continue
    if (p.periodos?.length && (i.periodo == null || !p.periodos.includes(i.periodo))) continue
    const d = dm.get(s.disciplineId)
    const c = cfg.get(s.disciplineId)
    const carga = d?.cargaHoraria ?? 0
    const horasAula = p.cargaEmHoraRelogio === false ? carga : (carga * 60) / duracaoAulaMin
    const calculado = Math.min(12, Math.max(1, Math.round(horasAula / semanas)))
    const aulasSemanaTotal = c?.aulasSemana ?? (carga > 0 ? calculado : 2)
    lista.push({
      ...i,
      disciplina: d?.nome ?? s.disciplineId,
      disciplina_cargaHoraria: carga,
      professorId: s.professorUserId,
      aulasSemanaTotal,
      cfg: { blocoMax: c?.blocoMax ?? 2, pratica: c?.pratica ?? false, tiposEspaco: c?.tiposEspaco ?? [], recursos: c?.recursos ?? [], capacidadeMinima: c?.capacidadeMinima ?? null, espacoFixoId: c?.espacoFixoId ?? null, online: c?.online ?? false },
    })
  }
  return { term, lista, duracaoAulaMin, semanas, diasLetivos: dl }
}

const faixa = (d: { diaSemana: number; inicioMin: number; fimMin: number }): Faixa => ({ dia: d.diaSemana, inicio: d.inicioMin, fim: d.fimMin })

export interface Contexto {
  term: { id: string; codigo: string }
  demandas: DemandaInfo[]
  removiveis: string[]
  avisos: string[]
  calendario: any
  malha: GenCelula[]
  duracaoAulaMin: number
}

export async function montarEntrada(tenantId: string, p: ParamsGerador): Promise<{ input: GenInput; ctx: Contexto }> {
  const { term, lista, duracaoAulaMin, semanas, diasLetivos } = await carregarDemandas(tenantId, p.termId, p)
  const avisos: string[] = []
  if (!lista.length) throw erro(404, 'Nenhuma turma encontrada para os filtros informados neste período letivo.')

  // Malha de horários
  const horarios = (await carregarMalha(tenantId)).filter((h) => !p.turnos?.length || p.turnos.includes(h.turno))
  const grade: GenCelula[] = []
  for (const dia of p.dias) for (const h of horarios) grade.push({ id: `${dia}:${h.id}`, dia, inicio: h.inicioMin, fim: h.fimMin, turno: h.turno })
  if (!grade.length) throw erro(400, 'A malha de horários está vazia (cadastre /horarios ou ajuste dias/turnos).')

  // Slots existentes: o que será removido e o que permanece como compromisso fixo
  const escopoIds = new Set(lista.map((d) => d.sectionId))
  const existentes = await prisma.calSlot.findMany({ where: { tenantId, termId: p.termId, ativo: true } })
  const removiveis: string[] = []
  const mantidos = [] as typeof existentes
  for (const s of existentes) {
    const noEscopo = escopoIds.has(s.classSectionId)
    const removivel = noEscopo && !s.fixo && ((s.origem === 'GERADOR' && p.substituirGerados) || (s.origem === 'MANUAL' && !p.preservarManuais))
    if (removivel) removiveis.push(s.id)
    else mantidos.push(s)
  }
  const ocupados: GenOcupado[] = mantidos.map((s) => ({ grupoId: s.grupo ?? s.classSectionId, professorId: s.professorUserId, espacoId: s.spaceId, dia: s.diaSemana, inicio: s.inicioMin, fim: s.fimMin }))
  const jaAlocadas = new Map<string, number>()
  for (const s of mantidos) if (escopoIds.has(s.classSectionId)) jaAlocadas.set(s.classSectionId, (jaAlocadas.get(s.classSectionId) ?? 0) + Math.max(1, Math.round((s.fimMin - s.inicioMin) / duracaoAulaMin)))

  // Grupos
  const grupos = new Map<string, GenGrupo>()
  for (const d of lista) {
    const g = grupos.get(d.grupo)
    if (!g) grupos.set(d.grupo, { id: d.grupo, nome: d.grupo, alunos: d.alunos, turno: d.turno, diasPermitidos: d.diasPermitidos })
    else {
      g.alunos = Math.max(g.alunos, d.alunos)
      g.turno = g.turno ?? d.turno
      if (!g.diasPermitidos?.length) g.diasPermitidos = d.diasPermitidos
    }
  }

  // Professores
  const profIds = [...new Set(lista.map((d) => d.professorId))]
  const [disp, perfis, nomes] = await Promise.all([
    prisma.calDisponibilidade.findMany({ where: { tenantId, userId: { in: profIds }, OR: [{ termId: null }, { termId: p.termId }] } }),
    prisma.calProfessorPerfil.findMany({ where: { tenantId, userId: { in: profIds } } }),
    nomesUsuarios(tenantId, profIds),
  ])
  const professores: GenProfessor[] = profIds.map((id) => {
    const pf = perfis.find((x) => x.userId === id)
    const mine = disp.filter((x) => x.userId === id)
    return {
      id,
      nome: nomes.get(id),
      disponivel: mine.filter((x) => x.tipo === 'DISPONIVEL').map(faixa),
      indisponivel: mine.filter((x) => x.tipo === 'INDISPONIVEL').map(faixa),
      preferencias: mine.filter((x) => x.tipo === 'PREFERENCIA').map(faixa),
      maxAulasDia: pf?.maxAulasDia ?? null,
      maxAulasSemana: pf?.maxAulasSemana ?? null,
    }
  })

  // Espaços + bloqueios semanais derivados das reservas aprovadas do período
  const camp = p.campusId
  const esp = await prisma.eduSpace.findMany({ where: { tenantId, ativo: true, ...(camp ? { OR: [{ campusId: null }, { campusId: camp }] } : {}) }, take: 1000 })
  const indispPorEspaco = new Map<string, Faixa[]>()
  if (p.considerarReservas) {
    const reservas = await prisma.calReserva.findMany({ where: { tenantId, status: 'APROVADA', spaceId: { in: esp.map((e) => e.id) }, inicio: { gte: term.dataInicio, lte: term.dataFim } }, take: 20000 })
    const padroes = new Map<string, { spaceId: string; dia: number; ini: number; fim: number; n: number; titulos: Set<string> }>()
    for (const r of reservas) {
      const l = toLocal(r.inicio)
      const ini = l.getUTCHours() * 60 + l.getUTCMinutes()
      const fim = ini + Math.round((r.fim.getTime() - r.inicio.getTime()) / 60000)
      const dia = isoWeekday(r.inicio)
      const k = `${r.spaceId}|${dia}|${ini}|${fim}`
      const x = padroes.get(k) ?? { spaceId: r.spaceId, dia, ini, fim, n: 0, titulos: new Set<string>() }
      x.n++
      x.titulos.add(r.titulo)
      padroes.set(k, x)
    }
    let pontuais = 0
    for (const x of padroes.values()) {
      if (x.n >= Math.max(3, Math.floor(semanas * 0.5))) {
        const arr = indispPorEspaco.get(x.spaceId) ?? []
        arr.push({ dia: x.dia, inicio: x.ini, fim: Math.min(1440, x.fim) })
        indispPorEspaco.set(x.spaceId, arr)
      } else pontuais += x.n
    }
    if (pontuais) avisos.push(`${pontuais} reserva(s) pontual(is) de espaços no período coincidem com dias da semana da grade e NÃO bloqueiam o gerador; confira as semanas afetadas.`)
    if (indispPorEspaco.size) avisos.push(`${indispPorEspaco.size} espaço(s) possuem reservas/bloqueios recorrentes que foram tratados como indisponibilidade semanal.`)
  }
  const espacos: GenEspaco[] = esp.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, capacidade: e.capacidade, recursos: toStrArray(e.recursos), indisponivel: indispPorEspaco.get(e.id) }))

  // Cruzamento com o calendário acadêmico
  const porDia = diasLetivos.porDiaSemana
  const max = Math.max(...p.dias.map((d) => porDia[d] ?? 0), 0)
  for (const d of p.dias) {
    if (max > 0 && (porDia[d] ?? 0) < max * 0.8) avisos.push(`${DIAS_SEMANA[d]} tem apenas ${porDia[d]} dia(s) letivo(s) no período (máx.: ${max}) por feriados/recessos; a carga dessa disciplina pode precisar de reposição.`)
  }
  const provas = await prisma.calExame.count({ where: { tenantId, termId: p.termId, status: { notIn: ['CANCELADA', 'REMARCADA'] } } })
  if (provas) avisos.push(`${provas} avaliação(ões) já agendada(s) no calendário de provas; elas usam datas específicas e não bloqueiam a grade semanal.`)

  // Demandas
  const aulasPlanejadas = (d: DemandaInfo) => Math.max(0, d.aulasSemanaTotal - (jaAlocadas.get(d.sectionId) ?? 0))
  const demandas: GenDemanda[] = lista
    .filter((d) => aulasPlanejadas(d) > 0)
    .map((d) => ({
      id: d.sectionId,
      grupoId: d.grupo,
      disciplinaId: d.disciplineId,
      rotulo: `${d.disciplina} (${d.nome})`,
      professorId: d.professorId,
      aulasSemana: aulasPlanejadas(d),
      blocoMax: d.cfg.blocoMax,
      pratica: d.cfg.pratica,
      online: d.cfg.online,
      tiposEspaco: d.cfg.tiposEspaco,
      recursos: d.cfg.recursos,
      capacidadeMin: d.cfg.capacidadeMinima ?? undefined,
      espacoFixoId: d.cfg.espacoFixoId,
    }))
  const input: GenInput = {
    grade,
    grupos: [...grupos.values()],
    professores,
    espacos,
    demandas,
    ocupados,
    opcoes: { maxMs: p.maxMs, maxNos: p.maxNos, beam: p.beam, maxAulasGrupoDia: p.maxAulasGrupoDia },
  }
  const calendario = {
    periodo: term.codigo,
    semanasLetivas: semanas,
    diasLetivosPorDiaSemana: porDia,
    totalDiasLetivos: diasLetivos.totalDias,
    naoLetivos: diasLetivos.naoLetivos.slice(0, 40),
  }
  return { input, ctx: { term: { id: term.id, codigo: term.codigo }, demandas: lista, removiveis, avisos, calendario, malha: grade, duracaoAulaMin } }
}

async function executar(tenantId: string, p: ParamsGerador) {
  const { input, ctx } = await montarEntrada(tenantId, p)
  const resultado = gerarCronograma(input)
  const erros = verificarResultado(input, resultado.alocacoes)
  if (erros.length) throw erro(500, `Falha de consistência no gerador: ${erros.slice(0, 3).join('; ')}`)
  const info = new Map(ctx.demandas.map((d) => [d.sectionId, d]))
  const nomes = await nomesUsuarios(tenantId, resultado.alocacoes.map((a) => a.professorId).concat(resultado.pendencias.map((x) => x.professorId)))
  const esp = await carregarEspacos(tenantId, resultado.alocacoes.map((a) => a.espacoId))
  const alocacoes = resultado.alocacoes.map((a) => {
    const d = info.get(a.demandaId)
    const e = a.espacoId ? esp.get(a.espacoId) : undefined
    return {
      classSectionId: a.demandaId, turma: d?.nome, disciplineId: a.disciplinaId, disciplina: d?.disciplina, grupo: a.grupoId, professorUserId: a.professorId, professor: a.professorId ? nomes.get(a.professorId) ?? null : null,
      spaceId: a.espacoId, espaco: e ? `${e.codigo} — ${e.nome}` : a.espacoId ? a.espacoId : null, diaSemana: a.dia, dia: DIAS_SEMANA[a.dia], inicioMin: a.inicio, fimMin: a.fim, inicio: minToHHMM(a.inicio), fim: minToHHMM(a.fim), aulas: a.aulas, pratica: a.pratica,
    }
  })
  const pendencias = resultado.pendencias.map((x) => {
    const d = info.get(x.demandaId)
    return { classSectionId: x.demandaId, turma: d?.nome, disciplina: d?.disciplina, grupo: x.grupoId, professor: x.professorId ? nomes.get(x.professorId) ?? null : null, aulasFaltantes: x.aulasFaltantes, motivo: x.motivo, detalhe: x.detalhe, sugestao: x.sugestao, contagem: x.contagem }
  })
  return { input, ctx, resultado, alocacoes, pendencias }
}

export function registerGerador(router: Router) {
  // Pré-análise: o que o gerador vai considerar (sem executar a busca)
  router.post(
    '/gerador/diagnostico',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = parseBody(paramsGerador, req.body)
      const { input, ctx } = await montarEntrada(tenantId, p)
      const totalAulas = input.demandas.reduce((s, d) => s + d.aulasSemana, 0)
      const capacidadeMalha = input.grade.length
      res.json({
        periodo: ctx.term.codigo,
        turmas: ctx.demandas.length,
        demandasComAulasPendentes: input.demandas.length,
        grupos: input.grupos.length,
        professores: input.professores.length,
        espacos: input.espacos.length,
        celulasNaMalha: capacidadeMalha,
        aulasASeremAlocadas: totalAulas,
        slotsQueSeraoSubstituidos: ctx.removiveis.length,
        compromissosFixos: input.ocupados?.length ?? 0,
        avisos: ctx.avisos,
        calendario: ctx.calendario,
        gruposSobrecarregados: input.grupos
          .map((g) => {
            const celulas = input.grade.filter((c) => (!g.turno || c.turno === g.turno) && (!g.diasPermitidos?.length || g.diasPermitidos.includes(c.dia))).length
            const aulas = input.demandas.filter((d) => d.grupoId === g.id).reduce((s, d) => s + d.aulasSemana, 0)
            return { grupo: g.id, aulas, celulasDisponiveis: celulas }
          })
          .filter((g) => g.aulas > g.celulasDisponiveis)
          .map((g) => ({ ...g, motivo: 'Mais aulas semanais do que horários disponíveis na malha para o turno/dias do grupo.' })),
      })
    }),
  )

  router.post(
    '/gerador/simular',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = parseBody(paramsGerador, req.body)
      const r = await executar(tenantId, p)
      const m = r.resultado.metricas
      const ex = await prisma.calGeracao.create({
        data: {
          tenantId, termId: p.termId, status: 'SIMULADA', parametros: p as any,
          resumo: { metricas: m, avisos: r.ctx.avisos, calendario: r.ctx.calendario, removiveis: r.ctx.removiveis.length } as any,
          pendencias: r.pendencias as any, totalAulas: m.totalAulas, alocadas: m.alocadas, pendentes: m.pendentes, pontuacao: m.pontuacao, nos: m.nos, duracaoMs: m.ms, criadoPorId: getUserId(req),
        },
      })
      res.json({ execucaoId: ex.id, modo: 'SIMULACAO', gravado: false, metricas: m, avisos: r.ctx.avisos, calendario: r.ctx.calendario, slotsQueSeriamSubstituidos: r.ctx.removiveis.length, alocacoes: r.alocacoes, pendencias: r.pendencias })
    }),
  )

  router.post(
    '/gerador/aplicar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const body = req.body ?? {}
      let p: ParamsGerador
      let execId: string | null = null
      if (body.execucaoId) {
        const ex = await prisma.calGeracao.findFirst({ where: { id: String(body.execucaoId), tenantId } })
        if (!ex) return res.status(404).json({ error: 'Execução não encontrada.' })
        if (ex.status === 'APLICADA') throw erro(409, 'Esta simulação já foi aplicada.')
        p = parseBody(paramsGerador, ex.parametros)
        execId = ex.id
      } else p = parseBody(paramsGerador, body)
      const r = await executar(tenantId, p)
      if (r.resultado.pendencias.length && !p.permitirPendencias)
        return res.status(409).json({ error: 'Há aulas que não puderam ser alocadas e "permitirPendencias" é falso.', pendencias: r.pendencias, metricas: r.resultado.metricas })

      const m = r.resultado.metricas
      const info = new Map(r.ctx.demandas.map((d) => [d.sectionId, d]))
      const geracao = execId
        ? await prisma.calGeracao.update({ where: { id: execId }, data: { status: 'APLICADA', aplicadoEm: new Date(), totalAulas: m.totalAulas, alocadas: m.alocadas, pendentes: m.pendentes, pontuacao: m.pontuacao, nos: m.nos, duracaoMs: m.ms, pendencias: r.pendencias as any, resumo: { metricas: m, avisos: r.ctx.avisos, calendario: r.ctx.calendario } as any } })
        : await prisma.calGeracao.create({ data: { tenantId, termId: p.termId, status: 'APLICADA', aplicadoEm: new Date(), parametros: p as any, resumo: { metricas: m, avisos: r.ctx.avisos, calendario: r.ctx.calendario } as any, pendencias: r.pendencias as any, totalAulas: m.totalAulas, alocadas: m.alocadas, pendentes: m.pendentes, pontuacao: m.pontuacao, nos: m.nos, duracaoMs: m.ms, criadoPorId: userId } })
      const antesSlots = r.ctx.removiveis.length ? await prisma.calSlot.findMany({ where: { id: { in: r.ctx.removiveis } }, select: { professorUserId: true } }) : []
      await prisma.$transaction([
        prisma.calSlot.deleteMany({ where: { tenantId, id: { in: r.ctx.removiveis } } }),
        prisma.calSlot.createMany({
          data: r.alocacoes.map((a) => {
            const d = info.get(a.classSectionId)!
            return { tenantId, termId: p.termId, classSectionId: a.classSectionId, disciplineId: a.disciplineId, grupo: d.grupo, programId: d.programId, periodo: d.periodo, professorUserId: a.professorUserId, spaceId: a.spaceId, diaSemana: a.diaSemana, inicioMin: a.inicioMin, fimMin: a.fimMin, tipoAula: (d.cfg.online ? 'ONLINE' : a.pratica ? 'PRATICA' : 'TEORICA') as any, origem: 'GERADOR' as any, geracaoId: geracao.id }
          }),
        }),
      ])
      // choques que existiam e deixaram de existir ficam RESOLVIDOS
      const varredura = await varrerGrade(tenantId, p.termId, userId)
      if (p.notificarProfessores) {
        const profs = new Set<string>([...r.alocacoes.map((a) => a.professorUserId).filter(Boolean) as string[], ...(antesSlots.map((s) => s.professorUserId).filter(Boolean) as string[])])
        for (const u of [...profs].slice(0, 500)) {
          await notify({ tenantId, userId: u, assunto: `Grade horária ${r.ctx.term.codigo} atualizada`, mensagem: `A grade horária do período ${r.ctx.term.codigo} foi atualizada. Confira seus horários em "Meu calendário".`, refType: 'CalGeracao', refId: geracao.id })
        }
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: 'APLICAR_GERADOR', refType: 'CalGeracao', refId: geracao.id, detalhes: { alocadas: m.alocadas, pendentes: m.pendentes, substituidos: r.ctx.removiveis.length, slotsCriados: r.alocacoes.length } })
      res.status(201).json({ execucaoId: geracao.id, modo: 'APLICACAO', gravado: true, slotsCriados: r.alocacoes.length, slotsSubstituidos: r.ctx.removiveis.length, metricas: m, avisos: r.ctx.avisos, pendencias: r.pendencias, varredura: { choques: varredura.choques, capacidadeETipo: varredura.capacidadeETipo, alunosEmChoque: varredura.alunosEmChoque } })
    }),
  )

  router.get(
    '/gerador/execucoes',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const where: any = { tenantId, ...(qs(req.query.termId) ? { termId: qs(req.query.termId) } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}) }
      const [items, total] = await Promise.all([
        prisma.calGeracao.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, select: { id: true, termId: true, status: true, totalAulas: true, alocadas: true, pendentes: true, pontuacao: true, nos: true, duracaoMs: true, criadoPorId: true, aplicadoEm: true, createdAt: true } }),
        prisma.calGeracao.count({ where }),
      ])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/gerador/execucoes/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const ex = await prisma.calGeracao.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) } })
      if (!ex) return res.status(404).json({ error: 'Execução não encontrada.' })
      res.json(ex)
    }),
  )

  router.post(
    '/gerador/execucoes/:id/descartar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const ex = await prisma.calGeracao.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!ex) return res.status(404).json({ error: 'Execução não encontrada.' })
      if (ex.status !== 'SIMULADA') throw erro(409, 'Só simulações podem ser descartadas.')
      await prisma.calGeracao.update({ where: { id: ex.id }, data: { status: 'DESCARTADA' } })
      res.json({ ok: true })
    }),
  )

  // Desfazer: remove os slots criados por uma aplicação do gerador
  router.post(
    '/gerador/execucoes/:id/desfazer',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const ex = await prisma.calGeracao.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!ex) return res.status(404).json({ error: 'Execução não encontrada.' })
      if (ex.status !== 'APLICADA') throw erro(409, 'Só execuções aplicadas podem ser desfeitas.')
      const del = await prisma.calSlot.deleteMany({ where: { tenantId, geracaoId: ex.id, fixo: false } })
      await prisma.calGeracao.update({ where: { id: ex.id }, data: { status: 'DESCARTADA' } })
      const v = await varrerGrade(tenantId, ex.termId, getUserId(req))
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DESFAZER_GERADOR', refType: 'CalGeracao', refId: ex.id, detalhes: { removidos: del.count } })
      res.json({ removidos: del.count, observacao: 'Os slots substituídos na aplicação NÃO são restaurados; rode o gerador novamente se necessário.', varredura: v.choques })
    }),
  )
}

