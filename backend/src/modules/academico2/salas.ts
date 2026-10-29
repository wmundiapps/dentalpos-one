import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, requireRole } from '../academico/middleware'
import { parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { validarSlot } from '../calendario/grade'
import { conflictsForCandidate, detectSlotConflicts } from '../calendario/conflicts'
import { comTravaDeEspaco, carregarMalha, datasBloqueadas, enriquecerSlots, nomesUsuarios, registrarConflitoManual, requireSpace, requireTerm, slotLike, toStrArray } from '../calendario/service'
import { resolverTurmas } from '../calendario/turmas'
import { DIAS_SEMANA, DIAS_SEMANA_CURTO, addDays, isoWeekday, localDateKey, minToHHMM, slotInstant, startOfLocalDay } from '../calendario/time'
import { CUR_READ, CUR_WRITE, MOD, escHtml, fail, optStr, paginaHtml, tid, uid, uniq } from './common'

export const TURNOS_PADRAO = [
  { codigo: 'MANHA', nome: 'Manhã', inicioMin: 450, fimMin: 720, dias: [1, 2, 3, 4, 5] },
  { codigo: 'TARDE', nome: 'Tarde', inicioMin: 810, fimMin: 1080, dias: [1, 2, 3, 4, 5] },
  { codigo: 'NOITE', nome: 'Noite', inicioMin: 1140, fimMin: 1360, dias: [1, 2, 3, 4, 5] },
  { codigo: 'FIM_DE_SEMANA', nome: 'Finais de semana', inicioMin: 480, fimMin: 1080, dias: [6, 7] },
]
const NIVEIS = ['GRADUACAO', 'POS', 'LIVRE', 'TECNICO'] as const
const COD_TURNO = ['MANHA', 'TARDE', 'NOITE', 'FIM_DE_SEMANA', 'INTEGRAL'] as const
const hhmm = z.number().int().min(0).max(1440)

/** Turno de um horário concreto (finais de semana têm turno próprio). */
export function turnoDoSlot(dia: number, inicioMin: number): string {
  if (dia >= 6) return 'FIM_DE_SEMANA'
  if (inicioMin < 750) return 'MANHA'
  if (inicioMin < 1110) return 'TARDE'
  return 'NOITE'
}

async function turnosDoTenant(tenantId: string) {
  const rows = await prisma.acaTurno.findMany({ where: { tenantId } })
  const m = new Map<string, { codigo: string; nome: string; inicioMin: number; fimMin: number; dias: number[]; ativo: boolean }>(TURNOS_PADRAO.map((t) => [t.codigo, { ...t, ativo: true }]))
  for (const r of rows) m.set(r.codigo, { codigo: r.codigo, nome: r.nome, inicioMin: r.inicioMin, fimMin: r.fimMin, dias: r.dias, ativo: r.ativo })
  return [...m.values()].filter((t) => t.ativo).sort((a, b) => a.inicioMin - b.inicioMin)
}

interface Ctx {
  slots: any[]
  espacos: Map<string, any>
  turmas: Map<string, any>
  perfis: Map<string, any>
  cfgs: Map<string, any>
  profNomes: Map<string, string>
  programas: Map<string, string>
}

async function carregarCtx(tenantId: string, termId: string): Promise<Ctx> {
  const slots = await prisma.calSlot.findMany({ where: { tenantId, termId, ativo: true }, orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }] })
  const secoes = await prisma.classSection.findMany({ where: { tenantId, termId } })
  const info = await resolverTurmas(tenantId, secoes)
  const [espacosArr, perfisArr, profNomes, progs, discs] = await Promise.all([
    prisma.eduSpace.findMany({ where: { tenantId } }),
    prisma.acaTurmaPerfil.findMany({ where: { tenantId, classSectionId: { in: secoes.map((s) => s.id) } } }),
    nomesUsuarios(tenantId, [...slots.map((s) => s.professorUserId), ...secoes.map((s) => s.professorUserId)]),
    prisma.academicProgram.findMany({ where: { tenantId }, select: { id: true, nome: true } }),
    prisma.discipline.findMany({ where: { tenantId, id: { in: uniq(secoes.map((s) => s.disciplineId)) } }, select: { id: true, nome: true } }),
  ])
  const mDisc = new Map(discs.map((d) => [d.id, d.nome]))
  const turmas = new Map<string, any>()
  for (const s of secoes) turmas.set(s.id, { ...s, info: info.get(s.id), disciplina: mDisc.get(s.disciplineId) ?? null })
  return {
    slots, espacos: new Map(espacosArr.map((e) => [e.id, { ...e, recursos: toStrArray(e.recursos) }])), turmas, perfis: new Map(perfisArr.map((p) => [p.classSectionId, p])), cfgs: new Map(),
    profNomes, programas: new Map(progs.map((p) => [p.id, p.nome])),
  }
}

function enriquecer(ctx: Ctx, s: any, choqueIds: Set<string>) {
  const t = ctx.turmas.get(s.classSectionId)
  const perfil = ctx.perfis.get(s.classSectionId)
  const e = s.spaceId ? ctx.espacos.get(s.spaceId) : null
  return {
    id: s.id, classSectionId: s.classSectionId, turma: t?.nome ?? null, disciplina: t?.disciplina ?? null, disciplineId: s.disciplineId, curso: s.programId ? ctx.programas.get(s.programId) ?? null : null, programId: s.programId, periodo: s.periodo,
    professorUserId: s.professorUserId, professor: s.professorUserId ? ctx.profNomes.get(s.professorUserId) ?? null : null,
    spaceId: s.spaceId, sala: e ? `${e.codigo} — ${e.nome}` : s.tipoAula === 'ONLINE' ? 'Online' : null, salaCodigo: e?.codigo ?? null,
    diaSemana: s.diaSemana, dia: DIAS_SEMANA[s.diaSemana], inicioMin: s.inicioMin, fimMin: s.fimMin, horario: `${minToHHMM(s.inicioMin)}–${minToHHMM(s.fimMin)}`, tipoAula: s.tipoAula,
    nivel: perfil?.nivel ?? 'GRADUACAO', turno: turnoDoSlot(s.diaSemana, s.inicioMin), turnoTurma: perfil?.turno ?? t?.info?.turno ?? null, conflito: choqueIds.has(s.id), fixo: s.fixo,
  }
}

/** Conflitos da grade: sala, professor, turma/grupo (choques) + capacidade, recursos, tipo de espaço e turno fora do perfil. */
export function analisarConflitos(ctx: Ctx) {
  const lista: Array<{ tipo: string; gravidade: 'ERRO' | 'AVISO'; descricao: string; slotIds: string[]; diaSemana?: number }> = []
  for (const c of detectSlotConflicts(ctx.slots.map((s) => slotLike(s)))) {
    const rotulo = c.tipo === 'ESPACO' ? 'SALA' : c.tipo
    let ref = ''
    if (c.tipo === 'ESPACO') ref = ctx.espacos.get(c.ref)?.codigo ?? ''
    else if (c.tipo === 'PROFESSOR') ref = ctx.profNomes.get(c.ref) ?? ''
    lista.push({ tipo: rotulo, gravidade: 'ERRO', descricao: `${c.descricao}${ref ? ` (${ref})` : ''}`, slotIds: c.slotIds, diaSemana: c.diaSemana })
  }
  for (const s of ctx.slots) {
    const t = ctx.turmas.get(s.classSectionId)
    const e = s.spaceId ? ctx.espacos.get(s.spaceId) : null
    const alunos = t?.info?.alunos ?? 0
    const nome = `${t?.nome ?? 'Turma'} (${DIAS_SEMANA_CURTO[s.diaSemana]} ${minToHHMM(s.inicioMin)})`
    if (e && s.tipoAula !== 'ONLINE') {
      if (e.capacidade > 0 && alunos > e.capacidade) lista.push({ tipo: 'CAPACIDADE', gravidade: 'ERRO', descricao: `${nome}: sala ${e.codigo} comporta ${e.capacidade} e a turma tem ${alunos}.`, slotIds: [s.id], diaSemana: s.diaSemana })
      const exig: string[] = ctx.perfis.get(s.classSectionId)?.recursosExigidos ?? []
      const falta = exig.filter((r) => !e.recursos.some((x: string) => x.toLowerCase() === r.toLowerCase()))
      if (falta.length) lista.push({ tipo: 'RECURSO', gravidade: 'ERRO', descricao: `${nome}: sala ${e.codigo} sem ${falta.join(', ')}.`, slotIds: [s.id], diaSemana: s.diaSemana })
      if (!e.ativo) lista.push({ tipo: 'SALA', gravidade: 'ERRO', descricao: `${nome}: sala ${e.codigo} está inativa.`, slotIds: [s.id], diaSemana: s.diaSemana })
    }
    const alvo = ctx.perfis.get(s.classSectionId)?.turno
    if (alvo && alvo !== 'INTEGRAL' && turnoDoSlot(s.diaSemana, s.inicioMin) !== alvo) lista.push({ tipo: 'TURNO', gravidade: 'AVISO', descricao: `${nome}: aula fora do turno previsto da turma (${alvo}).`, slotIds: [s.id], diaSemana: s.diaSemana })
  }
  return lista
}

interface Sugestao { spaceId: string; sala: string; capacidade: number; diaSemana: number; dia: string; inicioMin: number; fimMin: number; horario: string; turno: string; score: number; motivos: string[]; avisos: string[] }

/** Sugere (sem gravar) combinações dia/horário/sala sem conflitos, com pontuação. */
export function sugerirAlocacao(
  ctx: Ctx, turmaId: string,
  p: { duracaoMin: number; dias?: number[]; turno?: string; spaceTipo?: string[]; recursos?: string[]; limite?: number; malha: Array<{ turno: string; inicioMin: number; fimMin: number }>; turnos: Array<{ codigo: string; inicioMin: number; fimMin: number; dias: number[] }>; indisponiveis: Array<{ diaSemana: number; inicioMin: number; fimMin: number }> },
) {
  const t = ctx.turmas.get(turmaId)
  const perfil = ctx.perfis.get(turmaId)
  const alunos = t?.info?.alunos ?? perfil?.alunosEstimados ?? 0
  const turnoAlvo = p.turno ?? perfil?.turno
  const exig = uniq([...(perfil?.recursosExigidos ?? []), ...(p.recursos ?? [])])
  const rej: Record<string, number> = { sala_ocupada: 0, professor_ocupado: 0, turma_ocupada: 0, capacidade: 0, recursos: 0, tipo_sala: 0, professor_indisponivel: 0 }
  const out: Sugestao[] = []
  const turnosAlvo = p.turnos.filter((x) => !turnoAlvo || turnoAlvo === 'INTEGRAL' || x.codigo === turnoAlvo)
  const salas = [...ctx.espacos.values()].filter((e) => e.ativo && (!p.spaceTipo?.length || p.spaceTipo.includes(e.tipo)))
  const jaDaTurma = ctx.slots.filter((s) => s.classSectionId === turmaId)
  const diasDaTurma = new Set(jaDaTurma.map((s) => s.diaSemana))
  const salaDaTurma = new Set(jaDaTurma.map((s) => s.spaceId).filter(Boolean))
  const grupo = t?.info?.grupo ?? turmaId
  for (const tn of turnosAlvo) {
    const dias = (p.dias?.length ? p.dias : tn.dias).filter((d) => tn.dias.includes(d) || p.dias?.length)
    // janelas: faixas contíguas da malha (dias úteis) ou passos de 'duracao' (finais de semana)
    const faixas = p.malha.filter((m) => m.turno === tn.codigo).sort((a, b) => a.inicioMin - b.inicioMin)
    const janelas: Array<[number, number]> = []
    if (faixas.length && tn.codigo !== 'FIM_DE_SEMANA') {
      for (let i = 0; i < faixas.length; i++) {
        let fim = faixas[i].fimMin
        let j = i
        while (fim - faixas[i].inicioMin < p.duracaoMin && j + 1 < faixas.length) { j++; fim = faixas[j].fimMin }
        if (fim - faixas[i].inicioMin >= Math.min(p.duracaoMin, 50)) janelas.push([faixas[i].inicioMin, fim])
      }
    } else {
      for (let ini = tn.inicioMin; ini + p.duracaoMin <= tn.fimMin; ini += 60) janelas.push([ini, ini + p.duracaoMin])
    }
    for (const dia of dias) {
      for (const [ini, fim] of janelas) {
        if (p.indisponiveis.some((x) => x.diaSemana === dia && x.inicioMin < fim && x.fimMin > ini)) { rej.professor_indisponivel++; continue }
        for (const sala of salas) {
          const cand = { id: 'novo', diaSemana: dia, inicioMin: ini, fimMin: fim, classSectionId: turmaId, disciplineId: t?.disciplineId, grupo, professorUserId: t?.professorUserId ?? null, spaceId: sala.id }
          const choques = conflictsForCandidate(cand, ctx.slots.filter((s) => s.diaSemana === dia).map((s) => slotLike(s)))
          if (choques.some((c) => c.tipo === 'ESPACO')) { rej.sala_ocupada++; continue }
          if (choques.some((c) => c.tipo === 'PROFESSOR')) { rej.professor_ocupado++; continue }
          if (choques.some((c) => c.tipo === 'TURMA')) { rej.turma_ocupada++; continue }
          if (sala.capacidade > 0 && alunos > sala.capacidade) { rej.capacidade++; continue }
          if (exig.some((r) => !sala.recursos.some((x: string) => x.toLowerCase() === r.toLowerCase()))) { rej.recursos++; continue }
          let score = 100
          const motivos: string[] = [], avisos: string[] = []
          if (sala.capacidade > 0 && alunos > 0) { const folga = (sala.capacidade - alunos) / sala.capacidade; score -= Math.round(folga * 30); motivos.push(`capacidade ${sala.capacidade} para ${alunos} aluno(s)`) }
          if (salaDaTurma.has(sala.id)) { score += 12; motivos.push('mesma sala das outras aulas da turma') }
          if (diasDaTurma.has(dia)) { score -= 8; avisos.push('turma já tem aula neste dia') } else motivos.push('distribui as aulas em dias diferentes')
          if (turnoAlvo && turnoAlvo !== 'INTEGRAL' && tn.codigo === turnoAlvo) { score += 5; motivos.push(`turno ${tn.codigo}`) }
          if (exig.length) motivos.push(`recursos: ${exig.join(', ')}`)
          out.push({ spaceId: sala.id, sala: `${sala.codigo} — ${sala.nome}`, capacidade: sala.capacidade, diaSemana: dia, dia: DIAS_SEMANA[dia], inicioMin: ini, fimMin: fim, horario: `${minToHHMM(ini)}–${minToHHMM(fim)}`, turno: tn.codigo, score, motivos, avisos })
        }
      }
    }
  }
  out.sort((a, b) => b.score - a.score || a.diaSemana - b.diaSemana || a.inicioMin - b.inicioMin)
  return { sugestoes: out.slice(0, p.limite ?? 10), totalCandidatas: out.length, rejeitadas: rej }
}

const grade = (titulo: string, slots: any[]) => {
  const horarios = uniq(slots.map((s) => `${s.inicioMin}-${s.fimMin}`)).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]))
  const dias = [1, 2, 3, 4, 5, 6, 7].filter((d) => slots.some((s) => s.diaSemana === d))
  if (!slots.length) return `<h2>${escHtml(titulo)}</h2><p>Sem aulas alocadas.</p>`
  return `<h2>${escHtml(titulo)}</h2><table><thead><tr><th>Horário</th>${dias.map((d) => `<th>${DIAS_SEMANA[d]}</th>`).join('')}</tr></thead><tbody>${horarios.map((h) => {
    const [i, f] = h.split('-').map(Number)
    return `<tr><td><b>${minToHHMM(i)}–${minToHHMM(f)}</b></td>${dias.map((d) => `<td>${slots.filter((s) => s.diaSemana === d && s.inicioMin === i && s.fimMin === f).map((s) => `${escHtml(s.disciplina ?? s.turma)}<br><small>${escHtml(s.turma ?? '')} · ${escHtml(s.sala ?? '')}${s.professor ? ' · ' + escHtml(s.professor) : ''}</small>`).join('<hr>')}</td>`).join('')}</tr>`
  }).join('')}</tbody></table>`
}

export function registerSalas(router: Router) {
  const leitura = requireRole(...CUR_READ)
  const escrita = requireRole(...CUR_WRITE)

  router.get('/salas/turnos', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const rows = await prisma.acaTurno.findMany({ where: { tenantId } })
    const personalizados = new Set(rows.map((r) => r.codigo))
    const m = new Map<string, any>(TURNOS_PADRAO.map((t) => [t.codigo, { ...t, id: null, ativo: true, padrao: true }]))
    for (const r of rows) m.set(r.codigo, { ...r, padrao: false })
    res.json({ items: [...m.values()].sort((a, b) => a.inicioMin - b.inicioMin), personalizados: [...personalizados], niveis: NIVEIS })
  }))
  router.put('/salas/turnos/:codigo', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const codigo = String(req.params.codigo)
    if (!(COD_TURNO as readonly string[]).includes(codigo)) fail(400, 'Turno inválido.')
    const b = parseBody(z.object({ nome: z.string().min(2).max(60), inicioMin: hhmm, fimMin: hhmm, dias: z.array(z.number().int().min(1).max(7)).min(1), ativo: z.boolean().default(true) }), req.body)
    if (b.fimMin <= b.inicioMin) fail(400, 'O horário final deve ser posterior ao inicial.')
    res.json(await prisma.acaTurno.upsert({ where: { tenantId_codigo: { tenantId, codigo } }, create: { ...b, tenantId, codigo }, update: b }))
  }))

  router.put('/salas/turmas/:classSectionId/perfil', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const classSectionId = String(req.params.classSectionId)
    const sec = await prisma.classSection.findFirst({ where: { id: classSectionId, tenantId } })
    if (!sec) fail(404, 'Turma não encontrada.')
    const b = parseBody(z.object({ nivel: z.enum(NIVEIS).default('GRADUACAO'), turno: z.enum(COD_TURNO).default('NOITE'), programId: optStr(60), alunosEstimados: z.number().int().min(0).max(5000).nullish(), recursosExigidos: z.array(z.string().max(60)).max(20).default([]), observacao: optStr(500) }), req.body)
    res.json(await prisma.acaTurmaPerfil.upsert({ where: { tenantId_classSectionId: { tenantId, classSectionId } }, create: { ...b, tenantId, classSectionId } as any, update: b as any }))
  }))

  router.get('/salas/turmas', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const termId = qs(req.query.termId)
    if (!termId) fail(400, 'Informe o período letivo (termId).')
    await requireTerm(tenantId, termId)
    const ctx = await carregarCtx(tenantId, termId)
    const items = [...ctx.turmas.values()].map((t) => {
      const sl = ctx.slots.filter((s) => s.classSectionId === t.id)
      const p = ctx.perfis.get(t.id)
      return { id: t.id, nome: t.nome, disciplina: t.disciplina, professor: ctx.profNomes.get(t.professorUserId) ?? null, alunos: t.info?.alunos ?? 0, nivel: p?.nivel ?? 'GRADUACAO', turno: p?.turno ?? null, recursosExigidos: p?.recursosExigidos ?? [], aulasAlocadas: sl.length, minutosSemana: sl.reduce((s, x) => s + (x.fimMin - x.inicioMin), 0) }
    })
    const nivel = qs(req.query.nivel), turno = qs(req.query.turno)
    res.json({ items: items.filter((i) => (!nivel || i.nivel === nivel) && (!turno || i.turno === turno)).sort((a, b) => a.nome.localeCompare(b.nome)) })
  }))

  router.get('/salas/cronograma', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const termId = qs(req.query.termId)
    if (!termId) fail(400, 'Informe o período letivo (termId).')
    await requireTerm(tenantId, termId)
    const visao = (qs(req.query.visao) || 'sala') as string
    if (!['sala', 'turma', 'professor', 'dia', 'turno', 'curso'].includes(visao)) fail(400, 'Visão inválida (sala, turma, professor, dia, turno ou curso).')
    const ctx = await carregarCtx(tenantId, termId)
    const choqueIds = new Set(analisarConflitos(ctx).filter((c) => c.gravidade === 'ERRO').flatMap((c) => c.slotIds))
    let slots = ctx.slots.map((s) => enriquecer(ctx, s, choqueIds))
    const f = { nivel: qs(req.query.nivel), turno: qs(req.query.turno), spaceId: qs(req.query.spaceId), classSectionId: qs(req.query.classSectionId), professorId: qs(req.query.professorId), programId: qs(req.query.programId), dia: qs(req.query.dia) }
    slots = slots.filter((s) => (!f.nivel || s.nivel === f.nivel) && (!f.turno || s.turno === f.turno) && (!f.spaceId || s.spaceId === f.spaceId) && (!f.classSectionId || s.classSectionId === f.classSectionId) && (!f.professorId || s.professorUserId === f.professorId) && (!f.programId || s.programId === f.programId) && (!f.dia || String(s.diaSemana) === f.dia))
    const chave = (s: any): [string, string] => visao === 'sala' ? [s.spaceId ?? 'sem-sala', s.sala ?? 'Sem sala'] : visao === 'turma' ? [s.classSectionId, s.turma ?? '—'] : visao === 'professor' ? [s.professorUserId ?? 'sem-prof', s.professor ?? 'Sem professor'] : visao === 'dia' ? [String(s.diaSemana), s.dia] : visao === 'curso' ? [s.programId ?? 'sem-curso', s.curso ?? 'Sem curso'] : [s.turno, s.turno]
    const grupos = new Map<string, { chave: string; rotulo: string; slots: any[] }>()
    for (const s of slots) { const [k, r] = chave(s); const g = grupos.get(k) ?? { chave: k, rotulo: r, slots: [] }; g.slots.push(s); grupos.set(k, g) }
    const porTurno: Record<string, number> = {}, porNivel: Record<string, number> = {}
    for (const s of slots) { porTurno[s.turno] = (porTurno[s.turno] ?? 0) + 1; porNivel[s.nivel] = (porNivel[s.nivel] ?? 0) + 1 }
    res.json({ visao, total: slots.length, grupos: [...grupos.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo)), resumo: { porTurno, porNivel, conflitos: choqueIds.size } })
  }))

  router.get('/salas/conflitos', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const termId = qs(req.query.termId)
    if (!termId) fail(400, 'Informe o período letivo (termId).')
    await requireTerm(tenantId, termId)
    const ctx = await carregarCtx(tenantId, termId)
    const items = analisarConflitos(ctx)
    const porTipo: Record<string, number> = {}
    for (const c of items) porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1
    res.json({ items, total: items.length, erros: items.filter((i) => i.gravidade === 'ERRO').length, porTipo })
  }))

  router.post('/salas/sugerir', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ termId: z.string().min(1), classSectionId: z.string().min(1), duracaoMin: z.number().int().min(30).max(600).default(100), dias: z.array(z.number().int().min(1).max(7)).max(7).optional(), turno: z.enum(COD_TURNO).optional(), spaceTipo: z.array(z.string()).optional(), recursos: z.array(z.string().max(60)).max(20).optional(), limite: z.number().int().min(1).max(50).default(10) }), req.body)
    await requireTerm(tenantId, b.termId)
    const ctx = await carregarCtx(tenantId, b.termId)
    const t = ctx.turmas.get(b.classSectionId)
    if (!t) fail(404, 'Turma não encontrada neste período.')
    const [malha, turnos, disp] = await Promise.all([carregarMalha(tenantId), turnosDoTenant(tenantId), t.professorUserId ? prisma.calDisponibilidade.findMany({ where: { tenantId, userId: t.professorUserId, tipo: 'INDISPONIVEL', OR: [{ termId: null }, { termId: b.termId }] } }) : Promise.resolve([])])
    const r = sugerirAlocacao(ctx, b.classSectionId, { ...b, malha, turnos, indisponiveis: disp })
    res.json({ turma: { id: t.id, nome: t.nome, disciplina: t.disciplina, alunos: t.info?.alunos ?? 0 }, ...r, aviso: 'Sugestões não são gravadas: confirme com "Alocar" para criar a aula na grade.' })
  }))

  router.post('/salas/alocar', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const b = parseBody(z.object({ termId: z.string().min(1), classSectionId: z.string().min(1), spaceId: z.string().nullish(), professorUserId: z.string().nullish(), diaSemana: z.number().int().min(1).max(7), inicioMin: hhmm, fimMin: hhmm, tipoAula: z.enum(['TEORICA', 'PRATICA', 'ONLINE']).default('TEORICA'), forcar: z.boolean().default(false), observacao: optStr(300) }), req.body)
    if (b.fimMin <= b.inicioMin) fail(400, 'O horário final deve ser posterior ao inicial.')
    await requireTerm(tenantId, b.termId)
    const sec = await prisma.classSection.findFirst({ where: { id: b.classSectionId, tenantId } })
    if (!sec) fail(404, 'Turma não encontrada.')
    if (sec.termId !== b.termId) fail(400, 'A turma pertence a outro período letivo.')
    const info = (await resolverTurmas(tenantId, [sec])).get(sec.id)!
    const professorUserId = b.professorUserId ?? sec.professorUserId
    if (b.professorUserId && !(await prisma.user.findFirst({ where: { id: b.professorUserId, tenantId }, select: { id: true } }))) fail(404, 'Professor não encontrado.')
    const spaceId = b.tipoAula === 'ONLINE' ? null : b.spaceId ?? null
    if (spaceId) await requireSpace(tenantId, spaceId)
    const r = await comTravaDeEspaco(tenantId, [`grade:${b.termId}`], async () => {
      const v = await validarSlot(tenantId, { termId: b.termId, classSectionId: sec.id, disciplineId: sec.disciplineId, grupo: info.grupo, professorUserId, spaceId, diaSemana: b.diaSemana, inicioMin: b.inicioMin, fimMin: b.fimMin, tipoAula: b.tipoAula, alunos: info.alunos })
      const perfil = await prisma.acaTurmaPerfil.findFirst({ where: { tenantId, classSectionId: sec.id } })
      const extra: string[] = []
      if (spaceId && perfil?.recursosExigidos.length) {
        const e = await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId } })
        const rec = toStrArray(e?.recursos)
        const falta = perfil.recursosExigidos.filter((x) => !rec.some((y) => y.toLowerCase() === x.toLowerCase()))
        if (falta.length) extra.push(`Sala sem os recursos exigidos pela turma: ${falta.join(', ')}.`)
      }
      const duros = [...v.duros, ...extra.map((descricao) => ({ tipo: 'RECURSO', descricao }))]
      if (duros.length && !b.forcar) return { conflito: { error: 'A alocação gera conflitos.', conflitos: duros, avisos: v.avisos } }
      const row = await prisma.calSlot.create({ data: { tenantId, termId: b.termId, classSectionId: sec.id, disciplineId: sec.disciplineId, grupo: info.grupo, programId: info.programId, periodo: info.periodo, professorUserId, spaceId, diaSemana: b.diaSemana, inicioMin: b.inicioMin, fimMin: b.fimMin, tipoAula: b.tipoAula as any, observacao: b.observacao ?? null, origem: 'MANUAL' } })
      return { row, v, duros }
    })
    if ('conflito' in r) return res.status(409).json(r.conflito)
    if (r.duros.length) for (const ch of r.v.choques) await registrarConflitoManual(tenantId, b.termId, { tipo: ch.tipo, chave: `slot:${ch.tipo}:${[r.row.id, ch.slotIds.find((x) => x !== 'novo') ?? ''].sort().join(':')}`, descricao: ch.descricao, detalhes: { forcadoPor: uid(req) } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'ALOCAR_SALA', refType: 'CalSlot', refId: r.row.id, detalhes: { forcado: r.duros.length > 0 } })
    res.status(201).json({ slot: r.row, avisos: r.v.avisos, conflitosForcados: r.duros })
  }))

  router.delete('/salas/slots/:id', escrita, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const s = await prisma.calSlot.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) fail(404, 'Aula da grade não encontrada.')
    await prisma.calSlot.delete({ where: { id: s.id } })
    await audit({ tenantId, userId: uid(req), modulo: MOD, acao: 'REMOVER_ALOCACAO', refType: 'CalSlot', refId: s.id })
    res.status(204).end()
  }))

  router.get('/salas/ocupacao', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const termId = qs(req.query.termId)
    if (!termId) fail(400, 'Informe o período letivo (termId).')
    await requireTerm(tenantId, termId)
    const ctx = await carregarCtx(tenantId, termId)
    const turnos = await turnosDoTenant(tenantId)
    const items = [...ctx.espacos.values()].filter((e) => e.ativo && ['SALA_AULA', 'LABORATORIO', 'AUDITORIO', 'CLINICA_ESCOLA'].includes(e.tipo)).map((e) => {
      const por: Record<string, { usadoMin: number; disponivelMin: number; pct: number }> = {}
      for (const t of turnos) {
        const disponivel = (t.fimMin - t.inicioMin) * t.dias.length
        const usado = ctx.slots.filter((s) => s.spaceId === e.id && turnoDoSlot(s.diaSemana, s.inicioMin) === t.codigo).reduce((a, s) => a + (s.fimMin - s.inicioMin), 0)
        por[t.codigo] = { usadoMin: usado, disponivelMin: disponivel, pct: disponivel ? Math.min(100, Math.round((usado / disponivel) * 100)) : 0 }
      }
      return { id: e.id, codigo: e.codigo, nome: e.nome, tipo: e.tipo, capacidade: e.capacidade, recursos: e.recursos, turnos: por }
    })
    res.json({ items, turnos })
  }))

  // calendário integrado: ocorrências datadas das aulas (descontando feriados/recessos) + eventos do calendário acadêmico
  router.get('/salas/agenda', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const termId = qs(req.query.termId)
    if (!termId) fail(400, 'Informe o período letivo (termId).')
    const term = await requireTerm(tenantId, termId)
    const de0 = qs(req.query.de) ? new Date(`${qs(req.query.de)}T00:00:00-03:00`) : term.dataInicio
    const ate0 = qs(req.query.ate) ? new Date(`${qs(req.query.ate)}T23:59:59-03:00`) : new Date(de0.getTime() + 6 * 86_400_000)
    if (isNaN(de0.getTime()) || isNaN(ate0.getTime()) || ate0 < de0) fail(400, 'Intervalo de datas inválido.')
    if (ate0.getTime() - de0.getTime() > 93 * 86_400_000) fail(400, 'Intervalo máximo de 93 dias.')
    const ctx = await carregarCtx(tenantId, termId)
    const f = { spaceId: qs(req.query.spaceId), classSectionId: qs(req.query.classSectionId), professorId: qs(req.query.professorId) }
    const slots = ctx.slots.filter((s) => (!f.spaceId || s.spaceId === f.spaceId) && (!f.classSectionId || s.classSectionId === f.classSectionId) && (!f.professorId || s.professorUserId === f.professorId))
    const bloq = await datasBloqueadas(tenantId, de0, ate0)
    const ocorrencias: any[] = []
    let d = startOfLocalDay(de0)
    for (let g = 0; g < 100 && d.getTime() <= ate0.getTime(); g++, d = addDays(d, 1)) {
      const key = localDateKey(d)
      if (d.getTime() < startOfLocalDay(term.dataInicio).getTime() || d.getTime() > startOfLocalDay(term.dataFim).getTime()) continue
      const wd = isoWeekday(d)
      for (const s of slots) {
        if (s.diaSemana !== wd) continue
        const e = enriquecer(ctx, s, new Set())
        ocorrencias.push({ data: key, slotId: s.id, turma: e.turma, disciplina: e.disciplina, professor: e.professor, sala: e.sala, inicio: slotInstant(d, s.inicioMin), fim: slotInstant(d, s.fimMin), horario: e.horario, turno: e.turno, suspensa: bloq.has(key), motivoSuspensao: bloq.get(key) ?? null })
      }
    }
    const eventos = await prisma.calEvento.findMany({ where: { tenantId, ativo: true, inicio: { lte: ate0 }, fim: { gte: de0 }, OR: [{ termId: null }, { termId }] }, orderBy: { inicio: 'asc' }, take: 300 })
    ocorrencias.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
    res.json({ de: de0, ate: ate0, ocorrencias, eventos: eventos.map((e) => ({ id: e.id, titulo: e.titulo, tipo: e.tipo, inicio: e.inicio, fim: e.fim, bloqueiaAulas: e.bloqueiaAulas, local: e.local })), diasSuspensos: [...bloq.entries()].map(([data, motivo]) => ({ data, motivo })) })
  }))

  router.get('/salas/imprimir', leitura, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = tid(req)
    const termId = qs(req.query.termId)
    if (!termId) fail(400, 'Informe o período letivo (termId).')
    const term = await requireTerm(tenantId, termId)
    const visao = qs(req.query.visao) || 'sala'
    if (!['sala', 'turma', 'professor'].includes(visao)) fail(400, 'Visão inválida (sala, turma ou professor).')
    const ctx = await carregarCtx(tenantId, termId)
    let slots = ctx.slots.map((s) => enriquecer(ctx, s, new Set()))
    const turno = qs(req.query.turno), nivel = qs(req.query.nivel), id = qs(req.query.id)
    slots = slots.filter((s) => (!turno || s.turno === turno) && (!nivel || s.nivel === nivel))
    const key = (s: any) => visao === 'sala' ? [s.spaceId, s.sala] : visao === 'turma' ? [s.classSectionId, s.turma] : [s.professorUserId, s.professor]
    const grupos = new Map<string, { r: string; l: any[] }>()
    for (const s of slots) { const [k, r] = key(s); if (!k || (id && k !== id)) continue; const g = grupos.get(k) ?? { r: r ?? '—', l: [] }; g.l.push(s); grupos.set(k, g) }
    const corpo = [...grupos.values()].sort((a, b) => a.r.localeCompare(b.r)).map((g) => grade(`${visao === 'sala' ? 'Sala' : visao === 'turma' ? 'Turma' : 'Professor'}: ${g.r}`, g.l)).join('') || '<p>Sem aulas alocadas.</p>'
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(paginaHtml(`Horários por ${visao}`, `Período ${term.codigo}${turno ? ' · turno ' + turno : ''}${nivel ? ' · nível ' + nivel : ''}`, corpo))
  }))
}
