import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { Choque, conflictsForCandidate, detectSlotConflicts } from './conflicts'
import { IcsEvento, buildIcs, rruleSemanal } from './ical'
import { DIAS_SEMANA, endOfLocalDay, minToHHMM, nextWeekdayOnOrAfter, parseDateKey, slotInstant, startOfLocalDay } from './time'
import {
  GESTAO, MODULO, SlotRow, TODOS_PAPEIS, carregarEspacos, datasBloqueadas, enriquecerSlots, erro, registrarConflitoManual, requireSpace, requireTerm,
  resolverConflitosDoRegistro, slotLike, sincronizarConflitos, temPapel, toStrArray, nomesUsuarios,
} from './service'
import { configDisciplina, resolverTurmas } from './turmas'

const hhmm = z.number().int().min(0).max(1440)

const slotBase = z.object({
  termId: z.string().min(1),
  classSectionId: z.string().min(1),
  professorUserId: z.string().nullish(),
  spaceId: z.string().nullish(),
  diaSemana: z.number().int().min(1).max(7),
  inicioMin: hhmm,
  fimMin: hhmm,
  tipoAula: z.enum(['TEORICA', 'PRATICA', 'ONLINE']).default('TEORICA'),
  fixo: z.boolean().default(false),
  observacao: z.string().max(500).nullish(),
  forcar: z.boolean().default(false),
})

export interface ValidacaoSlot {
  choques: Choque[]
  duros: Array<{ tipo: string; descricao: string }>
  avisos: string[]
}

/** Valida um slot candidato contra a grade do período, capacidade/tipo do espaço e disponibilidade do professor. */
export async function validarSlot(
  tenantId: string,
  c: { id?: string; termId: string; classSectionId: string; disciplineId: string; grupo: string; professorUserId: string | null; spaceId: string | null; diaSemana: number; inicioMin: number; fimMin: number; tipoAula: string; alunos: number },
): Promise<ValidacaoSlot> {
  const duros: ValidacaoSlot['duros'] = []
  const avisos: string[] = []
  const existentes = await prisma.calSlot.findMany({ where: { tenantId, termId: c.termId, ativo: true, diaSemana: c.diaSemana, inicioMin: { lt: c.fimMin }, fimMin: { gt: c.inicioMin }, ...(c.id ? { id: { not: c.id } } : {}) } })
  const cand = { id: c.id ?? 'novo', diaSemana: c.diaSemana, inicioMin: c.inicioMin, fimMin: c.fimMin, classSectionId: c.classSectionId, disciplineId: c.disciplineId, grupo: c.grupo, professorUserId: c.professorUserId, spaceId: c.spaceId }
  const choques = conflictsForCandidate(cand, existentes.map((s) => slotLike(s as any)))
  for (const ch of choques) duros.push({ tipo: ch.tipo, descricao: ch.descricao })

  if (c.spaceId && c.tipoAula !== 'ONLINE') {
    const e = (await carregarEspacos(tenantId, [c.spaceId])).get(c.spaceId)
    if (!e) duros.push({ tipo: 'ESPACO', descricao: 'Espaço não encontrado.' })
    else {
      if (!e.ativo) duros.push({ tipo: 'ESPACO', descricao: 'Espaço inativo.' })
      if (e.capacidade > 0 && c.alunos > e.capacidade) duros.push({ tipo: 'CAPACIDADE', descricao: `Espaço ${e.codigo} comporta ${e.capacidade}; a turma tem ${c.alunos} aluno(s).` })
      const cfg = (await configDisciplina(tenantId, [c.disciplineId])).get(c.disciplineId)
      const tipos = cfg?.tiposEspaco.length ? cfg.tiposEspaco : c.tipoAula === 'PRATICA' ? ['LABORATORIO'] : null
      if (tipos && !tipos.includes(e.tipo)) duros.push({ tipo: 'TIPO_ESPACO', descricao: `Aula ${c.tipoAula === 'PRATICA' ? 'prática' : 'desta disciplina'} exige espaço do tipo ${tipos.join('/')}; ${e.codigo} é ${e.tipo}.` })
      const faltam = (cfg?.recursos ?? []).filter((r) => !e.recursos.some((x) => x.toLowerCase() === r.toLowerCase()))
      if (faltam.length) duros.push({ tipo: 'TIPO_ESPACO', descricao: `Espaço ${e.codigo} não possui os recursos exigidos: ${faltam.join(', ')}.` })
    }
  }
  if (c.professorUserId) {
    const [disp, perfil, doDia] = await Promise.all([
      prisma.calDisponibilidade.findMany({ where: { tenantId, userId: c.professorUserId, OR: [{ termId: null }, { termId: c.termId }], diaSemana: c.diaSemana } }),
      prisma.calProfessorPerfil.findUnique({ where: { tenantId_userId: { tenantId, userId: c.professorUserId } } }),
      prisma.calSlot.findMany({ where: { tenantId, termId: c.termId, ativo: true, professorUserId: c.professorUserId, diaSemana: c.diaSemana, ...(c.id ? { id: { not: c.id } } : {}) } }),
    ])
    if (disp.some((d) => d.tipo === 'INDISPONIVEL' && d.inicioMin < c.fimMin && d.fimMin > c.inicioMin)) avisos.push('Professor declarou indisponibilidade neste horário.')
    const disponiveis = disp.filter((d) => d.tipo === 'DISPONIVEL')
    const todasDisp = await prisma.calDisponibilidade.count({ where: { tenantId, userId: c.professorUserId, tipo: 'DISPONIVEL', OR: [{ termId: null }, { termId: c.termId }] } })
    if (todasDisp > 0 && !disponiveis.some((d) => d.inicioMin <= c.inicioMin && d.fimMin >= c.fimMin)) avisos.push('Horário fora da disponibilidade informada pelo professor.')
    if (perfil?.maxAulasDia) {
      const min = doDia.reduce((s, x) => s + (x.fimMin - x.inicioMin), 0) + (c.fimMin - c.inicioMin)
      if (min > perfil.maxAulasDia * 50) avisos.push(`Professor ultrapassa o limite de ${perfil.maxAulasDia} aula(s)/dia.`)
    }
  }
  return { choques, duros, avisos }
}

async function carregarSecao(tenantId: string, id: string) {
  const s = await prisma.classSection.findFirst({ where: { id, tenantId } })
  if (!s) throw erro(404, 'Turma não encontrada.')
  return s
}

function filtroSlots(tenantId: string, q: Record<string, any>) {
  const where: any = { tenantId, ativo: true }
  if (qs(q.termId)) where.termId = qs(q.termId)
  if (qs(q.classSectionId)) where.classSectionId = qs(q.classSectionId)
  if (qs(q.turmaId)) where.classSectionId = qs(q.turmaId)
  if (qs(q.grupo)) where.grupo = qs(q.grupo)
  if (qs(q.professorId)) where.professorUserId = qs(q.professorId)
  if (qs(q.espacoId)) where.spaceId = qs(q.espacoId)
  if (qs(q.programId)) where.programId = qs(q.programId)
  if (qs(q.periodo)) where.periodo = parseInt(qs(q.periodo)!, 10)
  if (qs(q.dia)) where.diaSemana = parseInt(qs(q.dia)!, 10)
  return where
}

export async function eventosIcsDeSlots(tenantId: string, slots: SlotRow[]): Promise<IcsEvento[]> {
  const en = await enriquecerSlots(tenantId, slots)
  const terms = await prisma.academicTerm.findMany({ where: { tenantId, id: { in: [...new Set(slots.map((s) => s.termId))] } } })
  const tm = new Map(terms.map((t) => [t.id, t]))
  const feriadosPorTermo = new Map<string, Map<string, string>>()
  const out: IcsEvento[] = []
  for (const s of en) {
    const t = tm.get(s.termId)
    if (!t) continue
    if (!feriadosPorTermo.has(t.id)) feriadosPorTermo.set(t.id, await datasBloqueadas(tenantId, t.dataInicio, t.dataFim))
    const feriados = feriadosPorTermo.get(t.id)!
    const primeiro = nextWeekdayOnOrAfter(t.dataInicio, s.diaSemana)
    const ex: Date[] = []
    for (const k of feriados.keys()) {
      const d = parseDateKey(k)
      if ((d.getTime() >= primeiro.getTime()) && d.getTime() <= t.dataFim.getTime() && ((new Date(d.getTime() - 3 * 3600_000).getUTCDay() || 7) === s.diaSemana)) ex.push(slotInstant(d, s.inicioMin))
    }
    out.push({
      uid: `slot-${s.id}@edumaster`,
      titulo: `${s.disciplina ?? 'Aula'}${s.turma ? ' — ' + s.turma : ''}`,
      descricao: [s.professor ? `Professor(a): ${s.professor}` : '', s.tipoAula === 'PRATICA' ? 'Aula prática' : ''].filter(Boolean).join('\n'),
      local: s.espaco ? `${s.espaco.codigo} — ${s.espaco.nome}` : s.tipoAula === 'ONLINE' ? 'Online' : null,
      inicio: slotInstant(primeiro, s.inicioMin),
      fim: slotInstant(primeiro, s.fimMin),
      rrule: rruleSemanal(endOfLocalDay(t.dataFim)),
      exdates: ex,
      categorias: ['Aula'],
    })
  }
  return out
}

export function registerGrade(router: Router) {
  // ---------- Horários (malha) ----------
  mountCrud(router, {
    model: 'calHorario',
    path: '/horarios',
    read: TODOS_PAPEIS,
    readAll: true,
    write: GESTAO,
    create: z.object({ nome: z.string().min(1).max(60), turno: z.enum(['MANHA', 'TARDE', 'NOITE']), ordem: z.number().int().min(1).max(20), inicioMin: hhmm, fimMin: hhmm, ativo: z.boolean().optional() }),
    beforeCreate: (d: any) => {
      if (d.fimMin <= d.inicioMin) throw erro(400, 'O horário final deve ser posterior ao inicial.')
    },
    beforeUpdate: (d: any, _r, cur: any) => {
      if ((d.fimMin ?? cur.fimMin) <= (d.inicioMin ?? cur.inicioMin)) throw erro(400, 'O horário final deve ser posterior ao inicial.')
    },
    orderBy: [{ turno: 'asc' }, { ordem: 'asc' }],
    modulo: MODULO,
  })

  // ---------- Disponibilidade e perfil do professor ----------
  const donoOuGestao = (req: AuthenticatedRequest, userId: string) => userId === req.user?.id || temPapel(req.user?.role, ...GESTAO)

  router.get(
    '/professores/:userId/disponibilidade',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = String(req.params.userId)
      if (!donoOuGestao(req, userId)) return res.status(403).json({ error: 'Sem permissão.' })
      const [itens, perfil] = await Promise.all([
        prisma.calDisponibilidade.findMany({ where: { tenantId, userId, ...(qs(req.query.termId) ? { OR: [{ termId: null }, { termId: qs(req.query.termId) }] } : {}) }, orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }] }),
        prisma.calProfessorPerfil.findUnique({ where: { tenantId_userId: { tenantId, userId } } }),
      ])
      res.json({ itens, perfil })
    }),
  )

  router.put(
    '/professores/:userId/disponibilidade',
    requireRole('TEACHER', ...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = String(req.params.userId)
      if (!donoOuGestao(req, userId)) return res.status(403).json({ error: 'Professores só editam a própria disponibilidade.' })
      if (!(await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } }))) return res.status(404).json({ error: 'Usuário não encontrado.' })
      const b = parseBody(
        z.object({
          termId: z.string().nullish(),
          itens: z.array(z.object({ diaSemana: z.number().int().min(1).max(7), inicioMin: hhmm, fimMin: hhmm, tipo: z.enum(['DISPONIVEL', 'INDISPONIVEL', 'PREFERENCIA']).default('DISPONIVEL'), observacao: z.string().max(300).nullish() })).max(200),
          perfil: z.object({ maxAulasDia: z.number().int().min(1).max(12).nullish(), maxAulasSemana: z.number().int().min(1).max(60).nullish(), observacao: z.string().max(500).nullish() }).optional(),
        }),
        req.body,
      )
      for (const i of b.itens) if (i.fimMin <= i.inicioMin) throw erro(400, 'Faixa de horário inválida (fim <= início).')
      if (b.termId) await requireTerm(tenantId, b.termId)
      await prisma.$transaction([
        prisma.calDisponibilidade.deleteMany({ where: { tenantId, userId, termId: b.termId ?? null } }),
        prisma.calDisponibilidade.createMany({ data: b.itens.map((i) => ({ ...i, tenantId, userId, termId: b.termId ?? null })) }),
      ])
      if (b.perfil) {
        await prisma.calProfessorPerfil.upsert({ where: { tenantId_userId: { tenantId, userId } }, create: { tenantId, userId, ...b.perfil }, update: b.perfil })
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'DISPONIBILIDADE_PROFESSOR', refType: 'User', refId: userId, detalhes: { itens: b.itens.length } })
      res.json({ itens: b.itens.length })
    }),
  )

  // ---------- Configuração por disciplina / turma ----------
  const cfgDisc = z.object({
    aulasSemana: z.number().int().min(1).max(20).nullish(),
    blocoMax: z.number().int().min(1).max(6).default(2),
    pratica: z.boolean().default(false),
    tiposEspaco: z.array(z.string()).max(10).nullish(),
    recursos: z.array(z.string()).max(30).nullish(),
    capacidadeMinima: z.number().int().min(0).nullish(),
    espacoFixoId: z.string().nullish(),
    online: z.boolean().default(false),
  })
  router.get(
    '/config/disciplinas',
    requireRole(...GESTAO, 'TEACHER'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.json({ items: await prisma.calDisciplinaConfig.findMany({ where: { tenantId: getTenantId(req), ...(qs(req.query.disciplineId) ? { disciplineId: qs(req.query.disciplineId) } : {}) }, take: 500 }) })
    }),
  )
  router.put(
    '/config/disciplinas/:disciplineId',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const disciplineId = String(req.params.disciplineId)
      if (!(await prisma.discipline.findFirst({ where: { id: disciplineId, tenantId }, select: { id: true } }))) return res.status(404).json({ error: 'Disciplina não encontrada.' })
      const d = parseBody(cfgDisc, req.body)
      if (d.espacoFixoId) await requireSpace(tenantId, d.espacoFixoId)
      const data = { ...d, tiposEspaco: (d.tiposEspaco ?? undefined) as any, recursos: (d.recursos ?? undefined) as any }
      const row = await prisma.calDisciplinaConfig.upsert({ where: { tenantId_disciplineId: { tenantId, disciplineId } }, create: { tenantId, disciplineId, ...data }, update: data })
      res.json(row)
    }),
  )
  router.delete(
    '/config/disciplinas/:disciplineId',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      await prisma.calDisciplinaConfig.deleteMany({ where: { tenantId: getTenantId(req), disciplineId: String(req.params.disciplineId) } })
      res.status(204).end()
    }),
  )

  const cfgTurma = z.object({
    programId: z.string().nullish(),
    periodo: z.number().int().min(1).max(30).nullish(),
    turno: z.enum(['MANHA', 'TARDE', 'NOITE']).nullish(),
    grupo: z.string().max(100).nullish(),
    alunosEstimados: z.number().int().min(0).nullish(),
    diasPermitidos: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  })
  router.get(
    '/config/turmas',
    requireRole(...GESTAO, 'TEACHER'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      res.json({ items: await prisma.calTurmaConfig.findMany({ where: { tenantId: getTenantId(req), ...(qs(req.query.programId) ? { programId: qs(req.query.programId) } : {}), ...(qs(req.query.grupo) ? { grupo: qs(req.query.grupo) } : {}) }, take: 1000 }) })
    }),
  )
  router.put(
    '/config/turmas/:classSectionId',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const classSectionId = String(req.params.classSectionId)
      await carregarSecao(tenantId, classSectionId)
      const d = parseBody(cfgTurma, req.body)
      if (d.programId && !(await prisma.academicProgram.findFirst({ where: { id: d.programId, tenantId }, select: { id: true } }))) throw erro(404, 'Curso não encontrado.')
      const row = await prisma.calTurmaConfig.upsert({ where: { tenantId_classSectionId: { tenantId, classSectionId } }, create: { tenantId, classSectionId, ...d }, update: d })
      res.json(row)
    }),
  )

  // ---------- Slots da grade ----------
  router.get(
    '/grade',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const slots = (await prisma.calSlot.findMany({ where: filtroSlots(tenantId, req.query), orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }], take: 5000 })) as unknown as SlotRow[]
      const en = await enriquecerSlots(tenantId, slots)
      const porDia: Record<string, any[]> = {}
      for (const s of en) (porDia[DIAS_SEMANA[s.diaSemana]] ??= []).push({ ...s, horario: `${minToHHMM(s.inicioMin)}–${minToHHMM(s.fimMin)}` })
      res.json({ total: en.length, slots: en, porDia })
    }),
  )

  router.get(
    '/grade/slots',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const slots = (await prisma.calSlot.findMany({ where: filtroSlots(tenantId, req.query), orderBy: [{ diaSemana: 'asc' }, { inicioMin: 'asc' }], take: 5000 })) as unknown as SlotRow[]
      res.json({ total: slots.length, items: await enriquecerSlots(tenantId, slots) })
    }),
  )

  router.post(
    '/grade/slots',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(slotBase, req.body)
      if (b.fimMin <= b.inicioMin) throw erro(400, 'O horário final deve ser posterior ao inicial.')
      await requireTerm(tenantId, b.termId)
      const sec = await carregarSecao(tenantId, b.classSectionId)
      if (sec.termId !== b.termId) throw erro(400, 'A turma pertence a outro período letivo.')
      const info = (await resolverTurmas(tenantId, [sec])).get(sec.id)!
      const professorUserId = b.professorUserId ?? sec.professorUserId
      if (b.professorUserId && !(await prisma.user.findFirst({ where: { id: b.professorUserId, tenantId }, select: { id: true } }))) throw erro(404, 'Professor não encontrado.')
      const spaceId = b.tipoAula === 'ONLINE' ? null : b.spaceId ?? null
      if (spaceId) await requireSpace(tenantId, spaceId)
      const v = await validarSlot(tenantId, { termId: b.termId, classSectionId: sec.id, disciplineId: sec.disciplineId, grupo: info.grupo, professorUserId, spaceId, diaSemana: b.diaSemana, inicioMin: b.inicioMin, fimMin: b.fimMin, tipoAula: b.tipoAula, alunos: info.alunos })
      if (v.duros.length && !b.forcar) return res.status(409).json({ error: 'A alocação gera choques ou viola regras do espaço.', choques: v.duros, avisos: v.avisos, dica: 'Gestores podem repetir com "forcar": true; o choque ficará registrado como aberto.' })
      const row = await prisma.calSlot.create({
        data: { tenantId, termId: b.termId, classSectionId: sec.id, disciplineId: sec.disciplineId, grupo: info.grupo, programId: info.programId, periodo: info.periodo, professorUserId, spaceId, diaSemana: b.diaSemana, inicioMin: b.inicioMin, fimMin: b.fimMin, tipoAula: b.tipoAula as any, fixo: b.fixo, observacao: b.observacao ?? null, origem: 'MANUAL' },
      })
      if (v.duros.length) {
        for (const ch of v.choques) {
          await registrarConflitoManual(tenantId, b.termId, { tipo: ch.tipo, chave: `slot:${ch.tipo}:${[row.id, ch.slotIds.find((x) => x !== 'novo') ?? ''].sort().join(':')}`, descricao: ch.descricao, detalhes: { forcadoPor: getUserId(req) } })
        }
      }
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CRIAR_SLOT', refType: 'CalSlot', refId: row.id, detalhes: { forcado: b.forcar && v.duros.length > 0 } })
      res.status(201).json({ slot: row, avisos: v.avisos, choquesForcados: b.forcar ? v.duros : [] })
    }),
  )

  const editarSlot = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const id = String(req.params.id)
    const atual = await prisma.calSlot.findFirst({ where: { id, tenantId } })
    if (!atual) return res.status(404).json({ error: 'Slot não encontrado.' })
    const b = parseBody(slotBase.partial().omit({ termId: true, classSectionId: true }), req.body)
    const m = { ...atual, ...b, professorUserId: b.professorUserId === undefined ? atual.professorUserId : b.professorUserId, spaceId: b.spaceId === undefined ? atual.spaceId : b.spaceId }
    if (m.fimMin <= m.inicioMin) throw erro(400, 'O horário final deve ser posterior ao inicial.')
    if (m.spaceId && m.spaceId !== atual.spaceId) await requireSpace(tenantId, m.spaceId)
    const sec = await carregarSecao(tenantId, atual.classSectionId)
    const info = (await resolverTurmas(tenantId, [sec])).get(sec.id)!
    const v = await validarSlot(tenantId, { id, termId: atual.termId, classSectionId: atual.classSectionId, disciplineId: atual.disciplineId, grupo: atual.grupo ?? info.grupo, professorUserId: m.professorUserId, spaceId: m.tipoAula === 'ONLINE' ? null : m.spaceId, diaSemana: m.diaSemana, inicioMin: m.inicioMin, fimMin: m.fimMin, tipoAula: m.tipoAula, alunos: info.alunos })
    if (v.duros.length && !b.forcar) return res.status(409).json({ error: 'A alteração gera choques ou viola regras do espaço.', choques: v.duros, avisos: v.avisos })
    const { forcar: _f, ...dados } = b as any
    const row = await prisma.calSlot.update({ where: { id }, data: { ...dados, spaceId: m.tipoAula === 'ONLINE' ? null : m.spaceId, origem: 'MANUAL' } })
    // choques anteriores deste slot que sumiram ficam RESOLVIDOS
    const resto = detectSlotConflicts((await prisma.calSlot.findMany({ where: { tenantId, termId: atual.termId, ativo: true, diaSemana: { in: [atual.diaSemana, row.diaSemana] } } })).map((s) => slotLike(s as any)))
    const vivos = new Set(resto.map((c) => c.chave))
    const abertos = await prisma.calConflito.findMany({ where: { tenantId, status: 'ABERTO', chave: { contains: id } } })
    const resolvidos = abertos.filter((c) => !vivos.has(c.chave))
    if (resolvidos.length) await prisma.calConflito.updateMany({ where: { id: { in: resolvidos.map((c) => c.id) } }, data: { status: 'RESOLVIDO', resolvidoEm: new Date(), resolvidoPorId: getUserId(req) } })
    if (atual.professorUserId && (atual.diaSemana !== row.diaSemana || atual.inicioMin !== row.inicioMin || atual.spaceId !== row.spaceId))
      await notify({ tenantId, userId: atual.professorUserId, assunto: 'Alteração na grade horária', mensagem: `Sua aula de ${DIAS_SEMANA[row.diaSemana]} ${minToHHMM(row.inicioMin)}–${minToHHMM(row.fimMin)} foi alterada na grade.`, refType: 'CalSlot', refId: id })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'ATUALIZAR_SLOT', refType: 'CalSlot', refId: id, detalhes: { antes: { dia: atual.diaSemana, ini: atual.inicioMin, fim: atual.fimMin, espaco: atual.spaceId, prof: atual.professorUserId } } })
    res.json({ slot: row, avisos: v.avisos, choquesResolvidos: resolvidos.length })
  })
  router.patch('/grade/slots/:id', requireRole(...GESTAO), editarSlot)
  router.put('/grade/slots/:id', requireRole(...GESTAO), editarSlot)

  router.delete(
    '/grade/slots/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const id = String(req.params.id)
      const atual = await prisma.calSlot.findFirst({ where: { id, tenantId } })
      if (!atual) return res.status(404).json({ error: 'Slot não encontrado.' })
      await prisma.calSlot.delete({ where: { id } })
      const r = await resolverConflitosDoRegistro(tenantId, id, getUserId(req))
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'REMOVER_SLOT', refType: 'CalSlot', refId: id, detalhes: { choquesResolvidos: r.count } })
      res.status(204).end()
    }),
  )

  // ---------- Varredura de choques da grade do período ----------
  router.post(
    '/grade/validar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = String(parseBody(z.object({ termId: z.string() }), req.body).termId)
      await requireTerm(tenantId, termId)
      const r = await varrerGrade(tenantId, termId, getUserId(req))
      res.json(r)
    }),
  )

  router.get(
    '/grade/conflitos',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = qs(req.query.termId)
      const rows = await prisma.calConflito.findMany({ where: { tenantId, ...(termId ? { termId } : {}), ...(qs(req.query.status) ? { status: qs(req.query.status) as any } : { status: 'ABERTO' }) }, orderBy: { detectadoEm: 'desc' }, take: 500 })
      res.json({ total: rows.length, items: rows })
    }),
  )

  router.post(
    '/grade/conflitos/:id/ignorar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const c = await prisma.calConflito.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!c) return res.status(404).json({ error: 'Conflito não encontrado.' })
      await prisma.calConflito.update({ where: { id: c.id }, data: { status: 'IGNORADO', resolvidoPorId: getUserId(req), resolvidoEm: new Date() } })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'IGNORAR_CONFLITO', refType: 'CalConflito', refId: c.id })
      res.json({ ok: true })
    }),
  )

  // ---------- iCal ----------
  router.get(
    '/grade/ics',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const q = req.query
      if (!qs(q.termId) && !qs(q.turmaId) && !qs(q.professorId) && !qs(q.espacoId) && !qs(q.grupo)) throw erro(400, 'Informe termId e/ou turmaId, professorId, espacoId ou grupo.')
      const slots = (await prisma.calSlot.findMany({ where: filtroSlots(tenantId, q), take: 5000 })) as unknown as SlotRow[]
      const nome = qs(q.professorId) ? 'Grade do professor' : qs(q.espacoId) ? 'Ocupação do espaço' : 'Grade da turma'
      const ics = buildIcs(await eventosIcsDeSlots(tenantId, slots), { nome })
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="grade.ics"')
      res.send(ics)
    }),
  )

  // Cobertura: carga prevista x alocada por turma
  router.get(
    '/grade/cobertura',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = qs(req.query.termId)
      if (!termId) throw erro(400, 'Informe termId.')
      const { carregarDemandas } = await import('./gerador')
      const demandas = await carregarDemandas(tenantId, termId, {})
      const slots = await prisma.calSlot.findMany({ where: { tenantId, termId, ativo: true } })
      const dur = demandas.duracaoAulaMin
      const alocado = new Map<string, number>()
      for (const s of slots) alocado.set(s.classSectionId, (alocado.get(s.classSectionId) ?? 0) + Math.round((s.fimMin - s.inicioMin) / dur))
      const itens = demandas.lista.map((d) => ({ classSectionId: d.sectionId, turma: d.nome, disciplina: d.disciplina, grupo: d.grupo, aulasSemanaPrevistas: d.aulasSemanaTotal, aulasAlocadas: alocado.get(d.sectionId) ?? 0, faltam: Math.max(0, d.aulasSemanaTotal - (alocado.get(d.sectionId) ?? 0)), semProfessor: !d.professorId }))
      res.json({ termId, total: itens.length, completas: itens.filter((i) => i.faltam === 0).length, itens: itens.sort((a, b) => b.faltam - a.faltam) })
    }),
  )
}

/** Varre a grade do período: choques de professor/turma/espaço, capacidade/tipo e alunos em duas aulas ao mesmo tempo. */
export async function varrerGrade(tenantId: string, termId: string, userId?: string) {
  const slots = (await prisma.calSlot.findMany({ where: { tenantId, termId, ativo: true } })) as unknown as SlotRow[]
  const choques = detectSlotConflicts(slots.map(slotLike))
  const det = choques.map((c) => ({ tipo: c.tipo as any, chave: c.chave, descricao: c.descricao, detalhes: { slotIds: c.slotIds, ref: c.ref, dia: c.diaSemana, inicio: c.inicioMin, fim: c.fimMin } }))
  const r1 = await sincronizarConflitos(tenantId, termId, 'slot:', det, userId)

  // capacidade e tipo de espaço
  const espacos = await carregarEspacos(tenantId, slots.map((s) => s.spaceId))
  const secoes = await prisma.classSection.findMany({ where: { tenantId, id: { in: [...new Set(slots.map((s) => s.classSectionId))] } } })
  const info = await resolverTurmas(tenantId, secoes)
  const cfg = await configDisciplina(tenantId, [...new Set(slots.map((s) => s.disciplineId))])
  const det2: Array<{ tipo: any; chave: string; descricao: string; detalhes?: unknown }> = []
  for (const s of slots) {
    if (!s.spaceId || s.tipoAula === 'ONLINE') continue
    const e = espacos.get(s.spaceId)
    const alunos = info.get(s.classSectionId)?.alunos ?? 0
    if (!e) continue
    if (e.capacidade > 0 && alunos > e.capacidade) det2.push({ tipo: 'CAPACIDADE', chave: `cap:${s.id}`, descricao: `${e.codigo} comporta ${e.capacidade} e a turma tem ${alunos} aluno(s) (${DIAS_SEMANA[s.diaSemana]} ${minToHHMM(s.inicioMin)})`, detalhes: { slotId: s.id } })
    const c = cfg.get(s.disciplineId)
    const tipos = c?.tiposEspaco.length ? c.tiposEspaco : s.tipoAula === 'PRATICA' ? ['LABORATORIO'] : null
    if (tipos && !tipos.includes(e.tipo)) det2.push({ tipo: 'TIPO_ESPACO', chave: `cap:tipo:${s.id}`, descricao: `Aula exige ${tipos.join('/')} e está em ${e.codigo} (${e.tipo})`, detalhes: { slotId: s.id } })
  }
  const r2 = await sincronizarConflitos(tenantId, termId, 'cap:', det2, userId)

  // alunos matriculados em duas turmas com aulas simultâneas
  const porSecao = new Map<string, SlotRow[]>()
  for (const s of slots) (porSecao.get(s.classSectionId) ?? porSecao.set(s.classSectionId, []).get(s.classSectionId)!).push(s)
  const matr = await prisma.classSectionEnrollment.findMany({ where: { classSectionId: { in: [...porSecao.keys()] } }, select: { classSectionId: true, enrollmentId: true } })
  const alunosPorSecao = new Map<string, Set<string>>()
  for (const m of matr) (alunosPorSecao.get(m.classSectionId) ?? alunosPorSecao.set(m.classSectionId, new Set()).get(m.classSectionId)!).add(m.enrollmentId)
  const det3: Array<{ tipo: any; chave: string; descricao: string; detalhes?: unknown }> = []
  const secIds = [...porSecao.keys()]
  for (let i = 0; i < secIds.length; i++) {
    for (let j = i + 1; j < secIds.length; j++) {
      const a = secIds[i]
      const b = secIds[j]
      if ((info.get(a)?.grupo ?? a) === (info.get(b)?.grupo ?? b)) continue // já coberto pelo choque de turma/grupo
      const sa = alunosPorSecao.get(a)
      const sb = alunosPorSecao.get(b)
      if (!sa?.size || !sb?.size) continue
      const comuns = [...sa].filter((x) => sb.has(x)).length
      if (!comuns) continue
      for (const x of porSecao.get(a)!) for (const y of porSecao.get(b)!) {
        if (x.diaSemana === y.diaSemana && x.inicioMin < y.fimMin && y.inicioMin < x.fimMin) {
          const [p, q] = [x.id, y.id].sort()
          det3.push({ tipo: 'ALUNO', chave: `aluno:${p}:${q}`, descricao: `${comuns} aluno(s) matriculado(s) em duas turmas com aulas simultâneas (${DIAS_SEMANA[x.diaSemana]} ${minToHHMM(Math.max(x.inicioMin, y.inicioMin))})`, detalhes: { slotIds: [p, q], alunos: comuns } })
        }
      }
    }
  }
  const r3 = await sincronizarConflitos(tenantId, termId, 'aluno:', det3, userId)
  return {
    termId,
    slots: slots.length,
    choques: { total: choques.length, porTipo: { PROFESSOR: choques.filter((c) => c.tipo === 'PROFESSOR').length, TURMA: choques.filter((c) => c.tipo === 'TURMA').length, ESPACO: choques.filter((c) => c.tipo === 'ESPACO').length } },
    capacidadeETipo: det2.length,
    alunosEmChoque: det3.length,
    registro: { slots: r1, capacidade: r2, alunos: r3 },
    detalhes: [...det, ...det2, ...det3].slice(0, 200).map((d) => ({ tipo: d.tipo, descricao: d.descricao })),
  }
}

