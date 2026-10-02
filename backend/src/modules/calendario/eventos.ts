import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, mountCrud, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { cancelReminders, scheduleReminder } from '../core/reminders'
import { feriadosNacionais } from './holidays'
import { DAY_MS, addDays, endOfLocalDay, expandRecorrencia, isoWeekday, localDateKey, parseDateKey, startOfLocalDay, toLocal } from './time'
import { GESTAO, MODULO, PUBLICO_ROLES, TODOS_PAPEIS, diasLetivosDoPeriodo, erro, requireTerm, temPapel } from './service'

export const CATEGORIAS_PADRAO: Array<{ nome: string; cor: string; tipoPadrao: string }> = [
  { nome: 'Feriados', cor: '#DC2626', tipoPadrao: 'FERIADO' },
  { nome: 'Recessos e férias', cor: '#F59E0B', tipoPadrao: 'RECESSO' },
  { nome: 'Início e fim de período', cor: '#0F5FDB', tipoPadrao: 'INICIO_PERIODO' },
  { nome: 'Matrícula e rematrícula', cor: '#16A34A', tipoPadrao: 'MATRICULA' },
  { nome: 'Avaliações', cor: '#7C3AED', tipoPadrao: 'PROVA' },
  { nome: 'Segunda chamada e exames', cor: '#A855F7', tipoPadrao: 'SEGUNDA_CHAMADA' },
  { nome: 'Prazos acadêmicos', cor: '#EA580C', tipoPadrao: 'PRAZO_NOTAS' },
  { nome: 'Reuniões e conselhos', cor: '#0891B2', tipoPadrao: 'REUNIAO' },
  { nome: 'Colação e formatura', cor: '#B45309', tipoPadrao: 'COLACAO' },
  { nome: 'Semana acadêmica e eventos', cor: '#DB2777', tipoPadrao: 'SEMANA_ACADEMICA' },
  { nome: 'Institucional', cor: '#475569', tipoPadrao: 'EVENTO_INSTITUCIONAL' },
]

const TIPO_PARA_CATEGORIA: Record<string, string> = {
  FERIADO: 'Feriados', PONTO_FACULTATIVO: 'Feriados', RECESSO: 'Recessos e férias', FERIAS: 'Recessos e férias',
  INICIO_PERIODO: 'Início e fim de período', FIM_PERIODO: 'Início e fim de período', AULA_INAUGURAL: 'Início e fim de período',
  MATRICULA: 'Matrícula e rematrícula', REMATRICULA: 'Matrícula e rematrícula', TRANCAMENTO: 'Matrícula e rematrícula',
  PROVA: 'Avaliações', SEGUNDA_CHAMADA: 'Segunda chamada e exames', EXAME_FINAL: 'Segunda chamada e exames',
  PRAZO_NOTAS: 'Prazos acadêmicos', PRAZO_DIARIO: 'Prazos acadêmicos', REUNIAO: 'Reuniões e conselhos', CONSELHO_CLASSE: 'Reuniões e conselhos',
  COLACAO: 'Colação e formatura', FORMATURA: 'Colação e formatura', SEMANA_ACADEMICA: 'Semana acadêmica e eventos',
  EVENTO_INSTITUCIONAL: 'Institucional', VESTIBULAR: 'Institucional', ENADE: 'Institucional',
}

export async function garantirCategorias(tenantId: string): Promise<Map<string, string>> {
  for (const c of CATEGORIAS_PADRAO) {
    await prisma.calCategoria.upsert({
      where: { tenantId_nome: { tenantId, nome: c.nome } },
      create: { tenantId, nome: c.nome, cor: c.cor, tipoPadrao: c.tipoPadrao as any },
      update: {},
    })
  }
  const cats = await prisma.calCategoria.findMany({ where: { tenantId } })
  return new Map(cats.map((c) => [c.nome, c.id]))
}

const eventoBase = z.object({
  termId: z.string().nullish(),
  campusId: z.string().nullish(),
  programId: z.string().nullish(),
  categoriaId: z.string().nullish(),
  tipo: z
    .enum(['INICIO_PERIODO', 'FIM_PERIODO', 'MATRICULA', 'REMATRICULA', 'TRANCAMENTO', 'AULA_INAUGURAL', 'PROVA', 'SEGUNDA_CHAMADA', 'EXAME_FINAL', 'FERIADO', 'PONTO_FACULTATIVO', 'RECESSO', 'FERIAS', 'REUNIAO', 'CONSELHO_CLASSE', 'COLACAO', 'FORMATURA', 'PRAZO_NOTAS', 'PRAZO_DIARIO', 'SEMANA_ACADEMICA', 'VESTIBULAR', 'ENADE', 'DIA_LETIVO_EXTRA', 'EVENTO_INSTITUCIONAL', 'OUTRO'])
    .default('OUTRO'),
  titulo: z.string().min(2).max(200),
  descricao: z.string().max(4000).nullish(),
  local: z.string().max(200).nullish(),
  inicio: dateISO(),
  fim: dateISO().optional(),
  diaInteiro: z.boolean().default(true),
  publico: z.enum(['TODOS', 'ALUNOS', 'PROFESSORES', 'COORDENACAO', 'ADMINISTRATIVO']).default('TODOS'),
  recorrencia: z.enum(['NENHUMA', 'DIARIA', 'SEMANAL', 'QUINZENAL', 'MENSAL', 'ANUAL']).default('NENHUMA'),
  recorrenciaIntervalo: z.number().int().min(1).max(52).default(1),
  recorrenciaAte: dateISO().nullish(),
  bloqueiaAulas: z.boolean().optional(),
  lembreteDias: z.array(z.number().int().min(0).max(90)).max(6).default([]),
})
const eventoCreate = eventoBase
const eventoUpdate = eventoBase.partial()

const TIPOS_BLOQUEIO = new Set(['FERIADO', 'RECESSO', 'FERIAS'])

async function validarRefs(tenantId: string, d: { termId?: string | null; campusId?: string | null; programId?: string | null; categoriaId?: string | null }) {
  if (d.termId) await requireTerm(tenantId, d.termId)
  if (d.campusId && !(await prisma.campus.findFirst({ where: { id: d.campusId, tenantId }, select: { id: true } }))) throw erro(404, 'Campus não encontrado.')
  if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) throw erro(404, 'Curso não encontrado.')
  if (d.categoriaId && !(await prisma.calCategoria.findFirst({ where: { id: d.categoriaId, tenantId }, select: { id: true } }))) throw erro(404, 'Categoria não encontrada.')
}

function normalizar(d: any) {
  const inicio: Date = d.inicio
  let fim: Date = d.fim ?? d.inicio
  if (d.diaInteiro) {
    if (fim.getTime() <= inicio.getTime() || localDateKey(fim) === localDateKey(inicio)) fim = endOfLocalDay(fim.getTime() < inicio.getTime() ? inicio : fim)
  }
  if (fim.getTime() < inicio.getTime()) throw erro(400, 'O fim do evento não pode ser anterior ao início.')
  if (d.recorrencia && d.recorrencia !== 'NENHUMA' && d.recorrencia !== 'ANUAL' && !d.recorrenciaAte) throw erro(400, 'Informe "recorrenciaAte" para eventos recorrentes.')
  return { inicio, fim }
}

/** Agenda lembretes (D-n) da próxima ocorrência futura do evento para o público-alvo. Idempotente. */
export async function agendarLembretesEvento(e: { id: string; updatedAt: Date; tenantId: string; titulo: string; inicio: Date; fim: Date; recorrencia: any; recorrenciaIntervalo: number; recorrenciaAte: Date | null; lembreteDias: number[]; publico: string; ativo: boolean }) {
  if (!e.ativo || !e.lembreteDias?.length) return 0
  const now = new Date()
  const occ = expandRecorrencia({ inicio: e.inicio, fim: e.fim, recorrencia: e.recorrencia, intervalo: e.recorrenciaIntervalo, ate: e.recorrenciaAte, janelaDe: now, janelaAte: new Date(now.getTime() + 400 * DAY_MS), max: 800 })
  const prox = occ[0]
  if (!prox) return 0
  let n = 0
  for (const d of e.lembreteDias) {
    const remindAt = new Date(prox.inicio.getTime() - d * DAY_MS)
    if (remindAt.getTime() < now.getTime() - 12 * 3_600_000) continue
    for (const role of PUBLICO_ROLES[e.publico] ?? ['COORDINATOR']) {
      await scheduleReminder({
        tenantId: e.tenantId,
        modulo: MODULO,
        titulo: `${e.titulo} — ${d === 0 ? 'hoje' : `em ${d} dia(s)`}`,
        descricao: `Evento do calendário acadêmico em ${toLocal(prox.inicio).toISOString().slice(0, 10).split('-').reverse().join('/')}`,
        dueAt: prox.inicio,
        remindAt: new Date(Math.max(remindAt.getTime(), now.getTime())),
        refType: 'CalEvento',
        refId: e.id,
        assigneeRole: role,
        dedupeKey: `cal:evt:${e.id}:${e.updatedAt.getTime()}:${localDateKey(prox.inicio)}:${role}:D${d}`,
      })
      n++
    }
  }
  return n
}

function filtroVisibilidade(req: AuthenticatedRequest): any {
  const role = String(req.user?.role || '')
  if (role === 'STUDENT') return { publico: { in: ['TODOS', 'ALUNOS'] } }
  if (role === 'TEACHER') return { publico: { in: ['TODOS', 'PROFESSORES'] } }
  return {}
}

export interface OcorrenciaEvento {
  id: string
  eventoId: string
  titulo: string
  tipo: string
  categoriaId: string | null
  cor: string | null
  inicio: Date
  fim: Date
  diaInteiro: boolean
  local: string | null
  publico: string
  termId: string | null
  campusId: string | null
  programId: string | null
  bloqueiaAulas: boolean
  descricao: string | null
  recorrente: boolean
}

export async function listarOcorrencias(
  tenantId: string,
  de: Date,
  ate: Date,
  filtros: { termId?: string; campusId?: string; programId?: string; tipo?: string; categoriaId?: string; programIds?: string[]; extra?: any } = {},
): Promise<OcorrenciaEvento[]> {
  const and: any[] = []
  if (filtros.termId) and.push({ OR: [{ termId: null }, { termId: filtros.termId }] })
  if (filtros.campusId) and.push({ OR: [{ campusId: null }, { campusId: filtros.campusId }] })
  if (filtros.programId) and.push({ OR: [{ programId: null }, { programId: filtros.programId }] })
  if (filtros.programIds) and.push({ OR: [{ programId: null }, { programId: { in: filtros.programIds } }] })
  if (filtros.extra && Object.keys(filtros.extra).length) and.push(filtros.extra)
  const evs = await prisma.calEvento.findMany({
    where: {
      tenantId,
      ativo: true,
      ...(filtros.tipo ? { tipo: filtros.tipo as any } : {}),
      ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
      OR: [{ recorrencia: { not: 'NENHUMA' } }, { inicio: { lte: ate }, fim: { gte: de } }],
      AND: and,
    },
    orderBy: { inicio: 'asc' },
    take: 2000,
  })
  const cats = await prisma.calCategoria.findMany({ where: { tenantId } })
  const cor = new Map(cats.map((c) => [c.id, c.cor]))
  const out: OcorrenciaEvento[] = []
  for (const e of evs) {
    const occ = expandRecorrencia({ inicio: e.inicio, fim: e.fim, recorrencia: e.recorrencia, intervalo: e.recorrenciaIntervalo, ate: e.recorrenciaAte, janelaDe: de, janelaAte: ate, max: 800 })
    for (const o of occ) {
      out.push({
        id: `${e.id}@${localDateKey(o.inicio)}`,
        eventoId: e.id,
        titulo: e.titulo,
        tipo: e.tipo,
        categoriaId: e.categoriaId,
        cor: e.categoriaId ? cor.get(e.categoriaId) ?? null : null,
        inicio: o.inicio,
        fim: o.fim,
        diaInteiro: e.diaInteiro,
        local: e.local,
        publico: e.publico,
        termId: e.termId,
        campusId: e.campusId,
        programId: e.programId,
        bloqueiaAulas: e.bloqueiaAulas,
        descricao: e.descricao,
        recorrente: e.recorrencia !== 'NENHUMA',
      })
    }
  }
  return out.sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
}

// Modelo padrão de calendário de um período letivo (offsets em dias a partir do início/fim).
interface ItemModelo {
  chave: string
  tipo: string
  titulo: string
  ref: 'inicio' | 'fim'
  offset: number
  duracao: number
  publico: 'TODOS' | 'ALUNOS' | 'PROFESSORES' | 'COORDENACAO' | 'ADMINISTRATIVO'
  lembretes?: number[]
  prazo?: { tipo: string; etapa: string }
}

export const MODELO_PERIODO: ItemModelo[] = [
  { chave: 'rematricula', tipo: 'REMATRICULA', titulo: 'Rematrícula de veteranos', ref: 'inicio', offset: -30, duracao: 15, publico: 'ALUNOS', lembretes: [7, 1] },
  { chave: 'matricula', tipo: 'MATRICULA', titulo: 'Matrícula de ingressantes', ref: 'inicio', offset: -20, duracao: 10, publico: 'ALUNOS', lembretes: [7, 1] },
  { chave: 'inicio', tipo: 'INICIO_PERIODO', titulo: 'Início do período letivo', ref: 'inicio', offset: 0, duracao: 1, publico: 'TODOS', lembretes: [7, 1] },
  { chave: 'aula-inaugural', tipo: 'AULA_INAUGURAL', titulo: 'Aula inaugural', ref: 'inicio', offset: 0, duracao: 1, publico: 'TODOS' },
  { chave: 'trancamento', tipo: 'TRANCAMENTO', titulo: 'Prazo para trancamento de matrícula', ref: 'inicio', offset: 30, duracao: 1, publico: 'ALUNOS', lembretes: [7, 1] },
  { chave: 'p1', tipo: 'PROVA', titulo: 'Semana de provas — 1ª avaliação (N1)', ref: 'inicio', offset: 56, duracao: 5, publico: 'TODOS', lembretes: [7, 1] },
  { chave: 'prazo-n1', tipo: 'PRAZO_NOTAS', titulo: 'Prazo de lançamento de notas — N1', ref: 'inicio', offset: 66, duracao: 1, publico: 'PROFESSORES', lembretes: [7, 3, 1], prazo: { tipo: 'LANCAMENTO_NOTAS', etapa: 'N1' } },
  { chave: 'segunda-chamada-1', tipo: 'SEGUNDA_CHAMADA', titulo: 'Segunda chamada — N1', ref: 'inicio', offset: 70, duracao: 3, publico: 'ALUNOS', lembretes: [3] },
  { chave: 'p2', tipo: 'PROVA', titulo: 'Semana de provas — 2ª avaliação (N2)', ref: 'fim', offset: -28, duracao: 5, publico: 'TODOS', lembretes: [7, 1] },
  { chave: 'prazo-n2', tipo: 'PRAZO_NOTAS', titulo: 'Prazo de lançamento de notas — N2', ref: 'fim', offset: -14, duracao: 1, publico: 'PROFESSORES', lembretes: [7, 3, 1], prazo: { tipo: 'LANCAMENTO_NOTAS', etapa: 'N2' } },
  { chave: 'segunda-chamada-2', tipo: 'SEGUNDA_CHAMADA', titulo: 'Segunda chamada — N2', ref: 'fim', offset: -10, duracao: 3, publico: 'ALUNOS', lembretes: [3] },
  { chave: 'exame-final', tipo: 'EXAME_FINAL', titulo: 'Exame final', ref: 'fim', offset: -6, duracao: 4, publico: 'ALUNOS', lembretes: [7, 1] },
  { chave: 'prazo-final', tipo: 'PRAZO_NOTAS', titulo: 'Prazo de fechamento do diário e notas finais', ref: 'fim', offset: 5, duracao: 1, publico: 'PROFESSORES', lembretes: [7, 3, 1], prazo: { tipo: 'FECHAMENTO_FINAL', etapa: 'FINAL' } },
  { chave: 'conselho', tipo: 'CONSELHO_CLASSE', titulo: 'Conselho de classe', ref: 'fim', offset: 8, duracao: 1, publico: 'COORDENACAO', lembretes: [3] },
  { chave: 'fim', tipo: 'FIM_PERIODO', titulo: 'Encerramento do período letivo', ref: 'fim', offset: 0, duracao: 1, publico: 'TODOS' },
]

/** Importa feriados nacionais (idempotente por origemKey). */
export async function importarFeriadosNacionais(
  tenantId: string,
  anos: number[],
  opts: { campusId?: string | null; bloquearFacultativos?: boolean; incluirPascoa?: boolean },
  userId?: string,
) {
  const b = { campusId: opts.campusId ?? null, bloquearFacultativos: opts.bloquearFacultativos ?? true, incluirPascoa: opts.incluirPascoa ?? false }
  const cats = await garantirCategorias(tenantId)
  const catId = cats.get('Feriados') ?? null
  let criados = 0
  let existentes = 0
  for (const ano of anos) {
    for (const f of feriadosNacionais(ano)) {
      if (f.nome === 'Páscoa' && !b.incluirPascoa) continue
      const origemKey = `feriado:${f.data}${b.campusId ? ':' + b.campusId : ''}`
      const ex = await prisma.calEvento.findUnique({ where: { tenantId_origemKey: { tenantId, origemKey } } })
      if (ex) {
        existentes++
        continue
      }
      const inicio = parseDateKey(f.data)
      await prisma.calEvento.create({
        data: {
          tenantId,
          campusId: b.campusId ?? null,
          categoriaId: catId,
          tipo: f.tipo,
          titulo: f.nome,
          inicio,
          fim: endOfLocalDay(inicio),
          diaInteiro: true,
          publico: 'TODOS',
          bloqueiaAulas: f.tipo === 'FERIADO' || b.bloquearFacultativos,
          origemKey,
          criadoPorId: userId,
        },
      })
      criados++
    }
  }
  return { criados, existentes }
}

export function registerEventos(router: Router) {
  mountCrud(router, {
    model: 'calCategoria',
    path: '/categorias',
    read: TODOS_PAPEIS,
    write: GESTAO,
    readAll: true,
    create: z.object({ nome: z.string().min(2).max(80), cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0F5FDB'), icone: z.string().max(40).nullish(), tipoPadrao: eventoBase.shape.tipo.nullish(), ativo: z.boolean().optional() }),
    search: ['nome'],
    orderBy: { nome: 'asc' },
    modulo: MODULO,
  })

  router.get(
    '/eventos',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const hoje = startOfLocalDay(new Date())
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : new Date(hoje.getTime() - 7 * DAY_MS)
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : new Date(hoje.getTime() + 90 * DAY_MS)
      if (isNaN(de.getTime()) || isNaN(ate.getTime())) throw erro(400, 'Datas inválidas (use ISO 8601).')
      if (ate.getTime() - de.getTime() > 800 * DAY_MS) throw erro(400, 'Janela máxima de consulta: ~26 meses.')
      let programIds: string[] | undefined
      if (req.user?.role === 'STUDENT' && req.user.studentId) {
        programIds = (await prisma.enrollment.findMany({ where: { studentId: req.user.studentId }, select: { programId: true } })).map((e) => e.programId)
      }
      const itens = await listarOcorrencias(tenantId, de, ate, {
        termId: qs(req.query.termId),
        campusId: qs(req.query.campusId),
        programId: qs(req.query.programId),
        tipo: qs(req.query.tipo),
        categoriaId: qs(req.query.categoriaId),
        programIds,
        extra: { ...filtroVisibilidade(req), ...(qs(req.query.publico) && temPapel(req.user?.role, 'COORDINATOR', 'SECRETARY') ? { publico: qs(req.query.publico) } : {}) },
      })
      res.json({ de, ate, total: itens.length, itens })
    }),
  )

  router.get(
    '/eventos/:id',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const e = await prisma.calEvento.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req), ...filtroVisibilidade(req) } })
      if (!e) return res.status(404).json({ error: 'Evento não encontrado.' })
      res.json(e)
    }),
  )

  router.post(
    '/eventos',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(eventoCreate, req.body)
      await validarRefs(tenantId, d)
      const { inicio, fim } = normalizar(d)
      let categoriaId = d.categoriaId ?? null
      if (!categoriaId && TIPO_PARA_CATEGORIA[d.tipo]) categoriaId = (await garantirCategorias(tenantId)).get(TIPO_PARA_CATEGORIA[d.tipo]) ?? null
      const row = await prisma.calEvento.create({
        data: { ...d, inicio, fim, categoriaId, bloqueiaAulas: d.bloqueiaAulas ?? TIPOS_BLOQUEIO.has(d.tipo), tenantId, criadoPorId: getUserId(req) },
      })
      await agendarLembretesEvento(row)
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CRIAR_EVENTO', refType: 'CalEvento', refId: row.id, detalhes: { tipo: row.tipo, titulo: row.titulo } })
      res.status(201).json(row)
    }),
  )

  const atualizar = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const id = String(req.params.id)
    const atual = await prisma.calEvento.findFirst({ where: { id, tenantId } })
    if (!atual) return res.status(404).json({ error: 'Evento não encontrado.' })
    const d: any = parseBody(eventoUpdate, req.body)
    await validarRefs(tenantId, d)
    const merged = { ...atual, ...d }
    // mudou só o início: preserva a duração original do evento
    const fimPadrao = d.fim ?? (d.inicio ? new Date(d.inicio.getTime() + (atual.fim.getTime() - atual.inicio.getTime())) : atual.fim)
    const { inicio, fim } = normalizar({ ...merged, fim: fimPadrao })
    const row = await prisma.calEvento.update({ where: { id }, data: { ...d, inicio, fim } })
    await cancelReminders({ tenantId, refType: 'CalEvento', refId: id })
    await agendarLembretesEvento(row)
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'ATUALIZAR_EVENTO', refType: 'CalEvento', refId: id, detalhes: { antes: { inicio: atual.inicio, fim: atual.fim, titulo: atual.titulo }, depois: { inicio: row.inicio, fim: row.fim, titulo: row.titulo } } })
    res.json(row)
  })
  router.patch('/eventos/:id', requireRole(...GESTAO), atualizar)
  router.put('/eventos/:id', requireRole(...GESTAO), atualizar)

  router.delete(
    '/eventos/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const atual = await prisma.calEvento.findFirst({ where: { id, tenantId } })
      if (!atual) return res.status(404).json({ error: 'Evento não encontrado.' })
      await prisma.calEvento.delete({ where: { id } })
      await cancelReminders({ tenantId, refType: 'CalEvento', refId: id })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'REMOVER_EVENTO', refType: 'CalEvento', refId: id, detalhes: { titulo: atual.titulo } })
      res.status(204).end()
    }),
  )

  // ---------- Feriados ----------
  router.get(
    '/feriados/nacionais',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const ano = parseInt(qs(req.query.ano) ?? String(new Date().getFullYear()), 10)
      if (!(ano >= 1900 && ano <= 2200)) throw erro(400, 'Ano inválido.')
      res.json(feriadosNacionais(ano))
    }),
  )

  router.post(
    '/feriados/importar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(
        z.object({
          anos: z.array(z.number().int().min(2000).max(2100)).min(1).max(5).optional(),
          ano: z.number().int().min(2000).max(2100).optional(),
          campusId: z.string().nullish(),
          bloquearFacultativos: z.boolean().default(true),
          incluirPascoa: z.boolean().default(false),
        }),
        req.body ?? {},
      )
      const anos = b.anos ?? [b.ano ?? new Date().getFullYear()]
      if (b.campusId) await validarRefs(tenantId, { campusId: b.campusId })
      const { criados, existentes } = await importarFeriadosNacionais(tenantId, anos, { campusId: b.campusId ?? null, bloquearFacultativos: b.bloquearFacultativos, incluirPascoa: b.incluirPascoa }, getUserId(req))
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'IMPORTAR_FERIADOS', detalhes: { anos, criados, existentes } })
      res.status(201).json({ anos, criados, existentes })
    }),
  )

  // ---------- Período letivo ----------
  router.get(
    '/periodos/:termId/dias-letivos',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const dias = qs(req.query.diasSemana)?.split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 7)
      const r = await diasLetivosDoPeriodo(tenantId, String(req.params.termId), { campusId: qs(req.query.campusId), programId: qs(req.query.programId), diasSemana: dias?.length ? dias : undefined })
      const semestral = (r.term.dataFim.getTime() - r.term.dataInicio.getTime()) / DAY_MS < 250
      const minimo = semestral ? 100 : 200 // LDB art. 47: 200 dias de trabalho acadêmico efetivo por ano letivo
      res.json({
        periodo: { id: r.term.id, codigo: r.term.codigo, inicio: r.term.dataInicio, fim: r.term.dataFim },
        totalDias: r.totalDias,
        porDiaSemana: r.porDiaSemana,
        semanasLetivas: r.semanasLetivas,
        naoLetivos: r.naoLetivos,
        diasExtras: r.extras,
        minimoLegal: minimo,
        atendeMinimoLegal: r.totalDias >= minimo,
        deficit: Math.max(0, minimo - r.totalDias),
      })
    }),
  )

  router.post(
    '/periodos/:termId/gerar-calendario',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const term = await requireTerm(tenantId, String(req.params.termId))
      const b = parseBody(z.object({ campusId: z.string().nullish(), programId: z.string().nullish(), incluirPrazos: z.boolean().default(true) }), req.body ?? {})
      await validarRefs(tenantId, b)
      const cats = await garantirCategorias(tenantId)
      let criados = 0
      let existentes = 0
      let prazos = 0
      const segunda = (d: Date) => {
        // alinha início de semanas de prova na segunda-feira
        const wd = isoWeekday(d)
        return wd === 1 ? d : addDays(d, wd <= 5 ? -(wd - 1) : 8 - wd)
      }
      for (const m of MODELO_PERIODO) {
        const base = startOfLocalDay(m.ref === 'inicio' ? term.dataInicio : term.dataFim)
        let ini = addDays(base, m.offset)
        if (m.tipo === 'PROVA') ini = segunda(ini)
        const fim = endOfLocalDay(addDays(ini, m.duracao - 1))
        const origemKey = `modelo:${term.id}:${m.chave}${b.programId ? ':' + b.programId : ''}${b.campusId ? ':' + b.campusId : ''}`
        const ex = await prisma.calEvento.findUnique({ where: { tenantId_origemKey: { tenantId, origemKey } } })
        if (ex) {
          existentes++
          continue
        }
        const row = await prisma.calEvento.create({
          data: {
            tenantId, termId: term.id, campusId: b.campusId ?? null, programId: b.programId ?? null,
            categoriaId: cats.get(TIPO_PARA_CATEGORIA[m.tipo]) ?? null,
            tipo: m.tipo as any, titulo: `${m.titulo} — ${term.codigo}`, inicio: ini, fim, diaInteiro: true,
            publico: m.publico, lembreteDias: m.lembretes ?? [], origemKey, criadoPorId: getUserId(req),
          },
        })
        await agendarLembretesEvento(row)
        criados++
        if (b.incluirPrazos && m.prazo) {
          const jaTem = await prisma.calPrazoNotas.findFirst({ where: { tenantId, termId: term.id, tipo: m.prazo.tipo as any, etapa: m.prazo.etapa, programId: b.programId ?? null } })
          if (!jaTem) {
            await prisma.calPrazoNotas.create({
              data: { tenantId, termId: term.id, programId: b.programId ?? null, campusId: b.campusId ?? null, tipo: m.prazo.tipo as any, etapa: m.prazo.etapa, titulo: `${m.titulo}`, prazo: endOfLocalDay(ini), abertura: addDays(ini, -14), criadoPorId: getUserId(req) },
            })
            prazos++
          }
        }
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'GERAR_CALENDARIO_PERIODO', refType: 'AcademicTerm', refId: term.id, detalhes: { criados, existentes, prazos } })
      res.status(201).json({ periodo: term.codigo, eventosCriados: criados, jaExistiam: existentes, prazosCriados: prazos })
    }),
  )
}

