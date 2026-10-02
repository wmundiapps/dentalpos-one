import { prisma } from '../../lib/prisma'
import { AcademicRole } from '../academico/middleware'
import { Bloqueio, calcularDiasLetivos } from './diasLetivos'
import { DAY_MS, addDays, expandRecorrencia, isoWeekday, localDateKey, slotInstant, startOfLocalDay, hhmmToMin } from './time'
import type { SlotLike } from './conflicts'

export const MODULO = 'calendario'

export const GESTAO: AcademicRole[] = ['COORDINATOR', 'SECRETARY']
export const APROVADORES_ESPACO: AcademicRole[] = ['FACILITIES', 'COORDINATOR', 'SECRETARY']
export const SOLICITANTES: AcademicRole[] = ['TEACHER', 'COORDINATOR', 'SECRETARY', 'FACILITIES', 'STAFF', 'LIBRARIAN', 'MARKETING', 'ADMISSIONS', 'SUPPORT', 'FINANCE']
export const TODOS_PAPEIS: AcademicRole[] = [
  'ADMIN', 'OWNER', 'RECTOR', 'COORDINATOR', 'TEACHER', 'STUDENT', 'FINANCE', 'BOARD', 'SECRETARY', 'LIBRARIAN', 'FACILITIES', 'SUPPLIES', 'MARKETING', 'ADMISSIONS', 'SUPPORT', 'STAFF',
]
export const SUPER = ['ADMIN', 'OWNER', 'RECTOR', 'BOARD']

export const isSuper = (role?: string) => SUPER.includes(String(role || '').toUpperCase())
export const temPapel = (role: string | undefined, ...papeis: AcademicRole[]) => isSuper(role) || papeis.includes(String(role || '').toUpperCase() as AcademicRole)

export function erro(status: number, message: string, extra?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { status, ...extra })
}

export function toStrArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : []
}

// ---------- Malha padrão (usada quando a IES ainda não cadastrou horários) ----------
export interface HorarioDef {
  nome: string
  turno: 'MANHA' | 'TARDE' | 'NOITE'
  ordem: number
  inicioMin: number
  fimMin: number
}

export const MALHA_PADRAO: HorarioDef[] = [
  ...(['07:30-08:20', '08:20-09:10', '09:30-10:20', '10:20-11:10', '11:10-12:00'] as const).map((h, i) => ({ nome: `${i + 1}ª aula (manhã)`, turno: 'MANHA' as const, ordem: i + 1, inicioMin: hhmmToMin(h.slice(0, 5)), fimMin: hhmmToMin(h.slice(6)) })),
  ...(['13:30-14:20', '14:20-15:10', '15:30-16:20', '16:20-17:10', '17:10-18:00'] as const).map((h, i) => ({ nome: `${i + 1}ª aula (tarde)`, turno: 'TARDE' as const, ordem: i + 1, inicioMin: hhmmToMin(h.slice(0, 5)), fimMin: hhmmToMin(h.slice(6)) })),
  ...(['19:00-19:50', '19:50-20:40', '21:00-21:50', '21:50-22:40'] as const).map((h, i) => ({ nome: `${i + 1}ª aula (noite)`, turno: 'NOITE' as const, ordem: i + 1, inicioMin: hhmmToMin(h.slice(0, 5)), fimMin: hhmmToMin(h.slice(6)) })),
]

export async function carregarMalha(tenantId: string): Promise<Array<HorarioDef & { id: string }>> {
  const rows = await prisma.calHorario.findMany({ where: { tenantId, ativo: true }, orderBy: [{ turno: 'asc' }, { ordem: 'asc' }] })
  if (rows.length) return rows.map((r) => ({ id: r.id, nome: r.nome, turno: r.turno, ordem: r.ordem, inicioMin: r.inicioMin, fimMin: r.fimMin }))
  return MALHA_PADRAO.map((h) => ({ ...h, id: `padrao:${h.turno}:${h.ordem}` }))
}

// ---------- Cadastros auxiliares ----------
export async function requireTerm(tenantId: string, termId: string) {
  const t = await prisma.academicTerm.findFirst({ where: { id: termId, tenantId } })
  if (!t) throw erro(404, 'Período letivo não encontrado.')
  return t
}

export async function nomesUsuarios(tenantId: string, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])]
  if (!uniq.length) return new Map()
  const us = await prisma.user.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, firstName: true, lastName: true } })
  return new Map(us.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
}

export async function carregarEspacos(tenantId: string, ids: Array<string | null | undefined>) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])]
  if (!uniq.length) return new Map<string, { id: string; codigo: string; nome: string; tipo: string; capacidade: number; recursos: string[]; campusId: string | null; ativo: boolean }>()
  const es = await prisma.eduSpace.findMany({ where: { tenantId, id: { in: uniq } } })
  return new Map(es.map((e) => [e.id, { id: e.id, codigo: e.codigo, nome: e.nome, tipo: e.tipo as string, capacidade: e.capacidade, recursos: toStrArray(e.recursos), campusId: e.campusId, ativo: e.ativo }]))
}

export async function requireSpace(tenantId: string, spaceId: string) {
  const e = await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId } })
  if (!e) throw erro(404, 'Espaço não encontrado.')
  if (!e.ativo) throw erro(409, 'Espaço inativo.')
  return e
}

export async function nomesDisciplinas(tenantId: string, ids: Array<string | null | undefined>) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])]
  if (!uniq.length) return new Map<string, string>()
  const ds = await prisma.discipline.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, nome: true } })
  return new Map(ds.map((d) => [d.id, d.nome]))
}

export async function nomesTurmas(tenantId: string, ids: Array<string | null | undefined>) {
  const uniq = [...new Set(ids.filter(Boolean) as string[])]
  if (!uniq.length) return new Map<string, string>()
  const ds = await prisma.classSection.findMany({ where: { tenantId, id: { in: uniq } }, select: { id: true, nome: true } })
  return new Map(ds.map((d) => [d.id, d.nome]))
}

// ---------- Calendário: bloqueios de aula (feriados/recessos) ----------
export async function bloqueiosDeAula(tenantId: string, de: Date, ate: Date, ctx: { campusId?: string | null; programId?: string | null } = {}): Promise<Bloqueio[]> {
  const evs = await prisma.calEvento.findMany({
    where: {
      tenantId,
      ativo: true,
      bloqueiaAulas: true,
      OR: [{ recorrencia: { not: 'NENHUMA' } }, { inicio: { lte: ate }, fim: { gte: de } }],
      AND: [
        { OR: [{ campusId: null }, ...(ctx.campusId ? [{ campusId: ctx.campusId }] : [])] },
        { OR: [{ programId: null }, ...(ctx.programId ? [{ programId: ctx.programId }] : [])] },
      ],
    },
  })
  const out: Bloqueio[] = []
  for (const e of evs) {
    const occ = expandRecorrencia({ inicio: e.inicio, fim: e.fim, recorrencia: e.recorrencia, intervalo: e.recorrenciaIntervalo, ate: e.recorrenciaAte, janelaDe: de, janelaAte: ate, max: 800 })
    for (const o of occ) out.push({ inicio: o.inicio, fim: o.fim, titulo: e.titulo })
  }
  return out
}

export async function datasBloqueadas(tenantId: string, de: Date, ate: Date, ctx: { campusId?: string | null; programId?: string | null } = {}): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  for (const b of await bloqueiosDeAula(tenantId, de, ate, ctx)) {
    let d = startOfLocalDay(b.inicio)
    const ultimo = startOfLocalDay(new Date(Math.max(b.fim.getTime() - 1, b.inicio.getTime())))
    for (let g = 0; d.getTime() <= ultimo.getTime() && g < 800; g++) {
      const k = localDateKey(d)
      if (!m.has(k)) m.set(k, b.titulo)
      d = addDays(d, 1)
    }
  }
  return m
}

export async function diasLetivosDoPeriodo(tenantId: string, termId: string, opts: { campusId?: string | null; programId?: string | null; diasSemana?: number[] } = {}) {
  const term = await requireTerm(tenantId, termId)
  const bloqueios = await bloqueiosDeAula(tenantId, term.dataInicio, term.dataFim, opts)
  const extrasEv = await prisma.calEvento.findMany({
    where: { tenantId, ativo: true, tipo: 'DIA_LETIVO_EXTRA', inicio: { lte: term.dataFim }, fim: { gte: term.dataInicio }, OR: [{ termId: null }, { termId }] },
  })
  const r = calcularDiasLetivos({
    inicio: term.dataInicio,
    fim: term.dataFim,
    diasSemana: opts.diasSemana,
    bloqueios,
    extras: extrasEv.map((e) => ({ inicio: e.inicio, fim: e.fim, titulo: e.titulo })),
  })
  return { term, ...r }
}

// ---------- Slots ----------
export interface SlotRow {
  id: string
  tenantId: string
  termId: string
  classSectionId: string
  disciplineId: string
  grupo: string | null
  programId: string | null
  periodo: number | null
  professorUserId: string | null
  spaceId: string | null
  diaSemana: number
  inicioMin: number
  fimMin: number
  tipoAula: string
  origem: string
  fixo: boolean
  ativo: boolean
  observacao: string | null
}

export const slotLike = (s: SlotRow): SlotLike => ({
  id: s.id,
  diaSemana: s.diaSemana,
  inicioMin: s.inicioMin,
  fimMin: s.fimMin,
  classSectionId: s.classSectionId,
  disciplineId: s.disciplineId,
  grupo: s.grupo,
  professorUserId: s.professorUserId,
  spaceId: s.spaceId,
})

export async function enriquecerSlots(tenantId: string, slots: SlotRow[]) {
  const [prof, esp, disc, turmas] = await Promise.all([
    nomesUsuarios(tenantId, slots.map((s) => s.professorUserId)),
    carregarEspacos(tenantId, slots.map((s) => s.spaceId)),
    nomesDisciplinas(tenantId, slots.map((s) => s.disciplineId)),
    nomesTurmas(tenantId, slots.map((s) => s.classSectionId)),
  ])
  return slots.map((s) => ({
    ...s,
    disciplina: disc.get(s.disciplineId) ?? null,
    turma: turmas.get(s.classSectionId) ?? null,
    professor: s.professorUserId ? prof.get(s.professorUserId) ?? null : null,
    espaco: s.spaceId ? (esp.get(s.spaceId) ? { id: s.spaceId, codigo: esp.get(s.spaceId)!.codigo, nome: esp.get(s.spaceId)!.nome } : null) : null,
  }))
}

// ---------- Ocupação de espaços em datas concretas ----------
export interface OcupacaoDoEspaco {
  tipo: 'RESERVA' | 'BLOQUEIO' | 'PROVA' | 'AULA'
  id: string
  titulo: string
  inicio: Date
  fim: Date
  ref?: string
}

export async function carregarOcupacaoEspaco(
  tenantId: string,
  spaceId: string,
  de: Date,
  ate: Date,
  ignorar: { reservaIds?: string[]; serieId?: string; exameId?: string } = {},
): Promise<OcupacaoDoEspaco[]> {
  const [reservas, exames, terms, slotsAll] = await Promise.all([
    prisma.calReserva.findMany({
      where: {
        tenantId,
        spaceId,
        status: 'APROVADA',
        inicio: { lt: ate },
        fim: { gt: de },
        ...(ignorar.reservaIds?.length ? { id: { notIn: ignorar.reservaIds } } : {}),
        ...(ignorar.serieId ? { OR: [{ serieId: null }, { serieId: { not: ignorar.serieId } }] } : {}),
      },
    }),
    prisma.calExame.findMany({
      where: { tenantId, spaceId, status: { notIn: ['CANCELADA', 'REMARCADA'] }, inicio: { lt: ate }, fim: { gt: de }, ...(ignorar.exameId ? { id: { not: ignorar.exameId } } : {}) },
    }),
    prisma.academicTerm.findMany({ where: { tenantId, dataInicio: { lte: ate }, dataFim: { gte: de } } }),
    prisma.calSlot.findMany({ where: { tenantId, spaceId, ativo: true } }),
  ])
  const out: OcupacaoDoEspaco[] = []
  for (const r of reservas) out.push({ tipo: r.bloqueio ? 'BLOQUEIO' : 'RESERVA', id: r.id, titulo: r.titulo, inicio: r.inicio, fim: r.fim })
  for (const e of exames) out.push({ tipo: 'PROVA', id: e.id, titulo: e.titulo, inicio: e.inicio, fim: e.fim, ref: e.classSectionId })
  if (terms.length && slotsAll.length) {
    const feriados = await datasBloqueadas(tenantId, de, ate)
    const termMap = new Map(terms.map((t) => [t.id, t]))
    const dias = Math.min(400, Math.ceil((ate.getTime() - de.getTime()) / DAY_MS) + 1)
    let d = startOfLocalDay(de)
    for (let g = 0; g < dias; g++, d = addDays(d, 1)) {
      const wd = isoWeekday(d)
      const key = localDateKey(d)
      if (feriados.has(key)) continue
      for (const s of slotsAll) {
        if (s.diaSemana !== wd) continue
        const t = termMap.get(s.termId)
        if (!t || d.getTime() < startOfLocalDay(t.dataInicio).getTime() || d.getTime() > startOfLocalDay(t.dataFim).getTime()) continue
        const i = slotInstant(d, s.inicioMin)
        const f = slotInstant(d, s.fimMin)
        if (i.getTime() < ate.getTime() && f.getTime() > de.getTime()) out.push({ tipo: 'AULA', id: s.id, titulo: 'Aula da grade horária', inicio: i, fim: f, ref: s.classSectionId })
      }
    }
  }
  return out
}

export const sobrepoe = (a: { inicio: Date; fim: Date }, b: { inicio: Date; fim: Date }) => a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime()

// ---------- Persistência de conflitos ----------
export interface ConflitoDet {
  tipo: 'PROFESSOR' | 'TURMA' | 'ESPACO' | 'ALUNO' | 'CAPACIDADE' | 'TIPO_ESPACO' | 'RESERVA' | 'PROVA'
  chave: string
  descricao: string
  detalhes?: unknown
}

/** Abre os conflitos detectados e marca como RESOLVIDO os que sumiram (mesmo prefixo de chave e período). */
export async function sincronizarConflitos(tenantId: string, termId: string | null, prefixo: string, detectados: ConflitoDet[], resolvidoPorId?: string) {
  const now = new Date()
  const existentes = await prisma.calConflito.findMany({ where: { tenantId, chave: { startsWith: prefixo }, ...(termId ? { termId } : {}) } })
  const porChave = new Map(existentes.map((c) => [c.chave, c]))
  const novos = new Set(detectados.map((d) => d.chave))
  let abertos = 0
  let reabertos = 0
  for (const d of detectados) {
    const ex = porChave.get(d.chave)
    if (!ex) {
      await prisma.calConflito.create({ data: { tenantId, termId, tipo: d.tipo, chave: d.chave, descricao: d.descricao, detalhes: d.detalhes as any } })
      abertos++
    } else if (ex.status === 'RESOLVIDO') {
      await prisma.calConflito.update({ where: { id: ex.id }, data: { status: 'ABERTO', resolvidoEm: null, descricao: d.descricao, detalhes: d.detalhes as any } })
      reabertos++
    }
  }
  const sumiram = existentes.filter((c) => c.status === 'ABERTO' && !novos.has(c.chave))
  if (sumiram.length) {
    await prisma.calConflito.updateMany({ where: { id: { in: sumiram.map((c) => c.id) } }, data: { status: 'RESOLVIDO', resolvidoEm: now, resolvidoPorId } })
  }
  return { abertos, reabertos, resolvidos: sumiram.length }
}

export async function resolverConflitosDoRegistro(tenantId: string, refId: string, userId?: string) {
  return prisma.calConflito.updateMany({
    where: { tenantId, status: 'ABERTO', chave: { contains: refId } },
    data: { status: 'RESOLVIDO', resolvidoEm: new Date(), resolvidoPorId: userId },
  })
}

export async function registrarConflitoManual(tenantId: string, termId: string | null, c: ConflitoDet) {
  return prisma.calConflito.upsert({
    where: { tenantId_chave: { tenantId, chave: c.chave } },
    create: { tenantId, termId, tipo: c.tipo, chave: c.chave, descricao: c.descricao, detalhes: c.detalhes as any },
    update: { status: 'ABERTO', resolvidoEm: null, descricao: c.descricao, detalhes: c.detalhes as any },
  })
}

export const PUBLICO_ROLES: Record<string, string[]> = {
  TODOS: ['TEACHER', 'STUDENT', 'COORDINATOR'],
  ALUNOS: ['STUDENT'],
  PROFESSORES: ['TEACHER'],
  COORDENACAO: ['COORDINATOR'],
  ADMINISTRATIVO: ['SECRETARY', 'STAFF'],
}
