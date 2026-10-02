import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, scheduleReminder } from '../core/reminders'
import { ChoqueExame, ExameLike, conflitosExame } from './rules'
import { DAY_MS, addDays, endOfLocalDay, localDateKey, startOfLocalDay, toLocal } from './time'
import {
  GESTAO, MODULO, comTravaDeEspaco, carregarEspacos, carregarOcupacaoEspaco, datasBloqueadas, erro, nomesUsuarios, requireSpace, requireTerm, sincronizarConflitos, temPapel,
} from './service'
import { resolverTurmas } from './turmas'

const fmt = (d: Date) => {
  const l = toLocal(d)
  return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()} ${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`
}

export async function secoesDoAluno(tenantId: string, studentId: string, termId?: string): Promise<string[]> {
  const links = await prisma.classSectionEnrollment.findMany({
    where: { enrollment: { studentId, status: { in: ['ATIVA', 'CONCLUIDA'] } }, classSection: { tenantId, ...(termId ? { termId } : {}) } },
    select: { classSectionId: true },
  })
  return [...new Set(links.map((l) => l.classSectionId))]
}

export async function secoesDoProfessor(tenantId: string, userId: string, termId?: string): Promise<string[]> {
  const s = await prisma.classSection.findMany({ where: { tenantId, professorUserId: userId, ...(termId ? { termId } : {}) }, select: { id: true } })
  return s.map((x) => x.id)
}

export async function alunosDaTurma(tenantId: string, classSectionId: string): Promise<string[]> {
  const links = await prisma.classSectionEnrollment.findMany({
    where: { classSectionId, classSection: { tenantId }, enrollment: { status: 'ATIVA' } },
    select: { enrollment: { select: { studentId: true } } },
    take: 5000,
  })
  return [...new Set(links.map((l) => l.enrollment.studentId))]
}

async function notificarAlunos(tenantId: string, classSectionId: string, assunto: string, mensagem: string, refId: string) {
  const ids = await alunosDaTurma(tenantId, classSectionId)
  for (const studentId of ids.slice(0, 3000)) await notify({ tenantId, studentId, assunto, mensagem, refType: 'CalExame', refId, templateKey: 'cal.prova' })
  return ids.length
}

export const TIPOS_EXAME = ['PROVA_1', 'PROVA_2', 'SUBSTITUTIVA', 'EXAME_FINAL', 'SEGUNDA_CHAMADA', 'REAVALIACAO', 'PROVA_UNICA', 'PRATICA', 'TRABALHO', 'SIMULADO'] as const

const fiscalIn = z.object({ userId: z.string().min(1), papel: z.enum(['FISCAL', 'COORDENADOR_SALA', 'APOIO']).default('FISCAL') })

const exameCreate = z.object({
  classSectionId: z.string().min(1),
  titulo: z.string().min(3).max(200).optional(),
  tipo: z.enum(TIPOS_EXAME).default('PROVA_1'),
  inicio: dateISO(),
  fim: dateISO(),
  spaceId: z.string().nullish(),
  professorUserId: z.string().nullish(),
  fiscais: z.array(fiscalIn).max(30).default([]),
  alunosPrevistos: z.number().int().min(0).nullish(),
  assessmentId: z.string().nullish(),
  segundaChamadaDias: z.number().int().min(0).max(60).default(7),
  observacoes: z.string().max(2000).nullish(),
})

interface Cand {
  id?: string
  termId: string
  classSectionId: string
  grupo: string | null
  spaceId: string | null
  professorUserId: string | null
  fiscais: string[]
  inicio: Date
  fim: Date
  alunos: number
  tipo: string
}

export async function validarExame(tenantId: string, c: Cand, term: { dataInicio: Date; dataFim: Date }): Promise<{ duros: string[]; avisos: string[]; choques: ChoqueExame[] }> {
  const duros: string[] = []
  const avisos: string[] = []
  if (c.fim.getTime() <= c.inicio.getTime()) duros.push('O fim deve ser posterior ao início.')
  if (c.fim.getTime() - c.inicio.getTime() > 8 * 3_600_000) duros.push('A avaliação não pode passar de 8 horas.')
  const limite = addDays(term.dataFim, c.tipo === 'SEGUNDA_CHAMADA' || c.tipo === 'EXAME_FINAL' || c.tipo === 'REAVALIACAO' ? 30 : 0)
  if (c.inicio.getTime() < startOfLocalDay(term.dataInicio).getTime() || c.inicio.getTime() > endOfLocalDay(limite).getTime()) duros.push('A data está fora do período letivo.')
  const bloqueadas = await datasBloqueadas(tenantId, startOfLocalDay(c.inicio), endOfLocalDay(c.inicio))
  const motivo = bloqueadas.get(localDateKey(c.inicio))
  if (motivo) duros.push(`Dia sem atividades acadêmicas (${motivo}).`)
  const doDia = await prisma.calExame.findMany({
    where: { tenantId, status: { notIn: ['CANCELADA', 'REMARCADA'] }, inicio: { gte: addDays(startOfLocalDay(c.inicio), -1), lte: addDays(endOfLocalDay(c.inicio), 1) }, ...(c.id ? { id: { not: c.id } } : {}) },
    include: { fiscais: { select: { userId: true } } },
  })
  const choques = conflitosExame(
    { id: c.id ?? 'novo', classSectionId: c.classSectionId, grupo: c.grupo, spaceId: c.spaceId, professorUserId: c.professorUserId, fiscais: c.fiscais, inicio: c.inicio, fim: c.fim },
    doDia.map((e) => ({ id: e.id, classSectionId: e.classSectionId, grupo: e.grupo, spaceId: e.spaceId, professorUserId: e.professorUserId, fiscais: e.fiscais.map((f) => f.userId), inicio: e.inicio, fim: e.fim, status: e.status }) as ExameLike),
  )
  for (const ch of choques) duros.push(ch.descricao)
  if (c.spaceId) {
    const e = (await carregarEspacos(tenantId, [c.spaceId])).get(c.spaceId)
    if (!e) duros.push('Sala não encontrada.')
    else {
      if (!e.ativo) duros.push('Sala inativa.')
      if (e.capacidade > 0 && c.alunos > e.capacidade) duros.push(`A sala ${e.codigo} comporta ${e.capacidade} e a avaliação prevê ${c.alunos} aluno(s).`)
      const ocup = await carregarOcupacaoEspaco(tenantId, c.spaceId, c.inicio, c.fim, { exameId: c.id })
      for (const o of ocup) {
        if (o.tipo === 'RESERVA' || o.tipo === 'BLOQUEIO') duros.push(`A sala está ${o.tipo === 'BLOQUEIO' ? 'bloqueada' : 'reservada'} neste horário: ${o.titulo}.`)
        else if (o.tipo === 'AULA' && o.ref !== c.classSectionId) avisos.push('Há aula de outra turma agendada nesta sala no horário (a prova deslocará a aula).')
      }
    }
  }
  if (c.professorUserId) {
    const wd = (toLocal(c.inicio).getUTCDay() || 7)
    const min = toLocal(c.inicio).getUTCHours() * 60 + toLocal(c.inicio).getUTCMinutes()
    const fimMin = min + Math.round((c.fim.getTime() - c.inicio.getTime()) / 60000)
    const aula = await prisma.calSlot.findFirst({ where: { tenantId, termId: c.termId, ativo: true, professorUserId: c.professorUserId, diaSemana: wd, inicioMin: { lt: fimMin }, fimMin: { gt: min }, classSectionId: { not: c.classSectionId } } })
    if (aula) avisos.push('O professor tem aula de outra turma neste horário.')
  }
  return { duros, avisos, choques }
}

async function agendarLembretesExame(tenantId: string, e: { id: string; updatedAt: Date; titulo: string; inicio: Date; professorUserId: string | null; spaceId: string | null }, fiscais: string[]) {
  const quando = fmt(e.inicio)
  if (e.professorUserId) {
    await scheduleReminder({ tenantId, modulo: MODULO, refType: 'CalExame', refId: e.id, titulo: `Avaliação em 3 dias: ${e.titulo}`, descricao: `Data: ${quando}. Confirme sala, fiscais e o material da prova.`, dueAt: e.inicio, remindAt: new Date(e.inicio.getTime() - 3 * DAY_MS), assigneeUserId: e.professorUserId, severity: 'ATENCAO', dedupeKey: `cal:prova:${e.id}:prof:${e.updatedAt.getTime()}` })
  }
  for (const f of fiscais) {
    await scheduleReminder({ tenantId, modulo: MODULO, refType: 'CalExame', refId: e.id, titulo: `Você é fiscal de prova amanhã: ${e.titulo}`, descricao: `Data: ${quando}.`, dueAt: e.inicio, remindAt: new Date(e.inicio.getTime() - DAY_MS), assigneeUserId: f, severity: 'ATENCAO', dedupeKey: `cal:prova:${e.id}:fiscal:${f}:${e.updatedAt.getTime()}` })
  }
}

async function carregarExame(tenantId: string, id: string) {
  const e = await prisma.calExame.findFirst({ where: { id, tenantId }, include: { fiscais: true } })
  if (!e) throw erro(404, 'Avaliação não encontrada.')
  return e
}

function podeGerir(req: AuthenticatedRequest, e: { professorUserId: string | null }) {
  return temPapel(req.user?.role, ...GESTAO) || (req.user?.role === 'TEACHER' && e.professorUserId === req.user.id)
}

async function escopoLeitura(req: AuthenticatedRequest, tenantId: string): Promise<any> {
  const role = String(req.user?.role || '')
  if (role === 'STUDENT') {
    if (!req.user?.studentId) return { id: '__nenhum__' }
    return { classSectionId: { in: await secoesDoAluno(tenantId, req.user.studentId) } }
  }
  if (role === 'TEACHER') {
    const minhas = await secoesDoProfessor(tenantId, req.user!.id)
    return { OR: [{ professorUserId: req.user!.id }, { fiscais: { some: { userId: req.user!.id } } }, { classSectionId: { in: minhas } }] }
  }
  return {}
}

export async function varrerProvas(tenantId: string, termId: string, userId?: string) {
  const exames = await prisma.calExame.findMany({ where: { tenantId, termId, status: { notIn: ['CANCELADA', 'REMARCADA'] } }, include: { fiscais: { select: { userId: true } } } })
  const det: Array<{ tipo: 'PROVA'; chave: string; descricao: string; detalhes?: unknown }> = []
  const like = exames.map((e) => ({ id: e.id, classSectionId: e.classSectionId, grupo: e.grupo, spaceId: e.spaceId, professorUserId: e.professorUserId, fiscais: e.fiscais.map((f) => f.userId), inicio: e.inicio, fim: e.fim, status: e.status }) as ExameLike)
  for (const e of like) {
    const outros = like.filter((o) => o.id > e.id)
    for (const c of conflitosExame(e, outros)) {
      const [a, b] = [e.id, c.outroId].sort()
      det.push({ tipo: 'PROVA', chave: `prova:${c.tipo}:${a}:${b}`, descricao: `${c.descricao} (${fmt(e.inicio)})`, detalhes: { exameIds: [a, b], tipo: c.tipo } })
    }
  }
  // choque com reservas/bloqueios aprovados
  for (const e of exames.filter((x) => x.spaceId)) {
    const ocup = await carregarOcupacaoEspaco(tenantId, e.spaceId!, e.inicio, e.fim, { exameId: e.id })
    for (const o of ocup.filter((x) => x.tipo === 'RESERVA' || x.tipo === 'BLOQUEIO')) {
      det.push({ tipo: 'PROVA', chave: `prova:SALA:${e.id}:${o.id}`, descricao: `Avaliação "${e.titulo}" em sala ${o.tipo === 'BLOQUEIO' ? 'bloqueada' : 'reservada'} (${fmt(e.inicio)})`, detalhes: { exameId: e.id, reservaId: o.id } })
    }
  }
  const reg = await sincronizarConflitos(tenantId, termId, 'prova:', det, userId)
  return { termId, avaliacoes: exames.length, conflitos: det.length, registro: reg, detalhes: det.map((d) => d.descricao).slice(0, 100) }
}

export function registerProvas(router: Router) {
  router.get(
    '/provas',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const escopo = await escopoLeitura(req, tenantId)
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : undefined
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : undefined
      const where: any = {
        tenantId,
        AND: [escopo],
        ...(qs(req.query.termId) ? { termId: qs(req.query.termId) } : {}),
        ...(qs(req.query.classSectionId) ? { classSectionId: qs(req.query.classSectionId) } : {}),
        ...(qs(req.query.grupo) ? { grupo: qs(req.query.grupo) } : {}),
        ...(qs(req.query.spaceId) ? { spaceId: qs(req.query.spaceId) } : {}),
        ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}),
        ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) } : {}),
        ...(de || ate ? { inicio: { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) } } : {}),
      }
      const [rows, total] = await Promise.all([prisma.calExame.findMany({ where, include: { fiscais: true }, orderBy: { inicio: 'asc' }, skip, take }), prisma.calExame.count({ where })])
      const turmas = await prisma.classSection.findMany({ where: { tenantId, id: { in: [...new Set(rows.map((r) => r.classSectionId))] } }, select: { id: true, nome: true } })
      const tn = new Map(turmas.map((t) => [t.id, t.nome]))
      const esp = await carregarEspacos(tenantId, rows.map((r) => r.spaceId))
      res.json({ items: rows.map((r) => ({ ...r, turma: tn.get(r.classSectionId) ?? null, sala: r.spaceId ? esp.get(r.spaceId)?.codigo ?? null : null })), total, page, pageSize })
    }),
  )

  router.get(
    '/provas/conflitos',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const termId = qs(req.query.termId)
      if (!termId) throw erro(400, 'Informe termId.')
      await requireTerm(tenantId, termId)
      res.json(await varrerProvas(tenantId, termId, getUserId(req)))
    }),
  )

  router.get(
    '/provas/:id',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const escopo = await escopoLeitura(req, tenantId)
      const e = await prisma.calExame.findFirst({ where: { id: String(req.params.id), tenantId, AND: [escopo] }, include: { fiscais: true } })
      if (!e) return res.status(404).json({ error: 'Avaliação não encontrada.' })
      const segundas = await prisma.calExame.findMany({ where: { tenantId, originalId: e.id }, orderBy: { inicio: 'asc' } })
      const nomes = await nomesUsuarios(tenantId, e.fiscais.map((f) => f.userId))
      res.json({ ...e, fiscais: e.fiscais.map((f) => ({ ...f, nome: nomes.get(f.userId) ?? null })), segundasChamadas: segundas })
    }),
  )

  router.post(
    '/provas',
    requireRole('TEACHER', ...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(exameCreate, req.body)
      const sec = await prisma.classSection.findFirst({ where: { id: b.classSectionId, tenantId } })
      if (!sec) throw erro(404, 'Turma não encontrada.')
      if (req.user?.role === 'TEACHER' && sec.professorUserId !== userId) throw erro(403, 'O professor só agenda avaliações das próprias turmas.')
      const term = await requireTerm(tenantId, sec.termId)
      const info = (await resolverTurmas(tenantId, [sec])).get(sec.id)!
      const disc = await prisma.discipline.findFirst({ where: { id: sec.disciplineId, tenantId }, select: { nome: true } })
      const professorUserId = b.professorUserId ?? sec.professorUserId
      if (b.spaceId) await requireSpace(tenantId, b.spaceId)
      const fiscais = [...new Map(b.fiscais.map((f) => [f.userId, f])).values()]
      if (fiscais.length) {
        const ok = await prisma.user.count({ where: { tenantId, id: { in: fiscais.map((f) => f.userId) } } })
        if (ok !== fiscais.length) throw erro(404, 'Algum fiscal informado não existe.')
      }
      const alunosPrevistos = b.alunosPrevistos ?? info.alunos
      // valida e grava sob trava do período: duas requisições concorrentes não podem ocupar a mesma sala/professor/grupo
      const travado = await comTravaDeEspaco(tenantId, [`exames:${sec.termId}`], async () => {
      const v = await validarExame(tenantId, { termId: sec.termId, classSectionId: sec.id, grupo: info.grupo, spaceId: b.spaceId ?? null, professorUserId, fiscais: fiscais.map((f) => f.userId), inicio: b.inicio, fim: b.fim, alunos: alunosPrevistos, tipo: b.tipo }, term)
      if (v.duros.length) return { conflito: { error: 'Não é possível agendar a avaliação.', motivos: v.duros, avisos: v.avisos } }
      const titulo = b.titulo ?? `${b.tipo.replace('_', ' ').toLowerCase()} — ${disc?.nome ?? sec.nome}`
      const janela = b.tipo !== 'SEGUNDA_CHAMADA' && b.segundaChamadaDias > 0 ? { segundaChamadaInicio: addDays(startOfLocalDay(b.fim), 1), segundaChamadaFim: endOfLocalDay(addDays(startOfLocalDay(b.fim), b.segundaChamadaDias)) } : {}
      const row = await prisma.calExame.create({
        data: {
          tenantId, termId: sec.termId, classSectionId: sec.id, disciplineId: sec.disciplineId, assessmentId: b.assessmentId ?? null, grupo: info.grupo, titulo, tipo: b.tipo, inicio: b.inicio, fim: b.fim, spaceId: b.spaceId ?? null, professorUserId, alunosPrevistos, observacoes: b.observacoes ?? null, criadoPorId: userId, ...janela,
          fiscais: { create: fiscais.map((f) => ({ tenantId, userId: f.userId, papel: f.papel })) },
        },
        include: { fiscais: true },
      })
      return { v, row, titulo }
      })
      if ('conflito' in travado) return res.status(409).json(travado.conflito)
      const { v, row, titulo } = travado
      await agendarLembretesExame(tenantId, row, fiscais.map((f) => f.userId))
      for (const f of fiscais) await notify({ tenantId, userId: f.userId, assunto: 'Escala de fiscalização', mensagem: `Você foi escalado(a) como ${f.papel.toLowerCase().replace('_', ' ')} na avaliação "${titulo}" em ${fmt(row.inicio)}.`, refType: 'CalExame', refId: row.id })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'AGENDAR_PROVA', refType: 'CalExame', refId: row.id, detalhes: { tipo: b.tipo, inicio: b.inicio } })
      res.status(201).json({ avaliacao: row, avisos: v.avisos })
    }),
  )

  router.patch(
    '/provas/:id',
    requireRole('TEACHER', ...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const atual = await carregarExame(tenantId, String(req.params.id))
      if (!podeGerir(req, atual)) throw erro(403, 'Sem permissão para alterar esta avaliação.')
      if (atual.status === 'REALIZADA' || atual.status === 'CANCELADA') throw erro(409, 'Avaliação encerrada não pode ser alterada.')
      const b = parseBody(z.object({ titulo: z.string().min(3).max(200), tipo: z.enum(TIPOS_EXAME), inicio: dateISO(), fim: dateISO(), spaceId: z.string().nullable(), professorUserId: z.string().nullable(), alunosPrevistos: z.number().int().min(0).nullable(), observacoes: z.string().max(2000).nullable(), motivo: z.string().max(500) }).partial(), req.body)
      const term = await requireTerm(tenantId, atual.termId)
      const novo = { inicio: b.inicio ?? atual.inicio, fim: b.fim ?? atual.fim, spaceId: b.spaceId === undefined ? atual.spaceId : b.spaceId, professorUserId: b.professorUserId === undefined ? atual.professorUserId : b.professorUserId, tipo: b.tipo ?? atual.tipo }
      if (novo.spaceId && novo.spaceId !== atual.spaceId) await requireSpace(tenantId, novo.spaceId)
      const v = await validarExame(tenantId, { id: atual.id, termId: atual.termId, classSectionId: atual.classSectionId, grupo: atual.grupo, spaceId: novo.spaceId, professorUserId: novo.professorUserId, fiscais: atual.fiscais.map((f) => f.userId), inicio: novo.inicio, fim: novo.fim, alunos: b.alunosPrevistos ?? atual.alunosPrevistos ?? 0, tipo: novo.tipo }, term)
      if (v.duros.length) return res.status(409).json({ error: 'A alteração não é possível.', motivos: v.duros, avisos: v.avisos })
      const { motivo, ...dados } = b
      const mudouData = novo.inicio.getTime() !== atual.inicio.getTime() || novo.fim.getTime() !== atual.fim.getTime() || novo.spaceId !== atual.spaceId
      const row = await prisma.calExame.update({
        where: { id: atual.id },
        data: { ...dados, ...(mudouData ? { lembreteAlunosEm: null } : {}), ...(mudouData && atual.tipo !== 'SEGUNDA_CHAMADA' && novo.tipo !== 'SEGUNDA_CHAMADA' ? { segundaChamadaInicio: addDays(startOfLocalDay(novo.fim), 1), segundaChamadaFim: endOfLocalDay(addDays(startOfLocalDay(novo.fim), 7)) } : {}) },
        include: { fiscais: true },
      })
      if (mudouData) {
        await cancelReminders({ tenantId, refType: 'CalExame', refId: atual.id })
        await agendarLembretesExame(tenantId, row, row.fiscais.map((f) => f.userId))
        const msg = `A avaliação "${row.titulo}" foi remarcada para ${fmt(row.inicio)}${motivo ? '. Motivo: ' + motivo : ''}.`
        await notificarAlunos(tenantId, row.classSectionId, 'Avaliação remarcada', msg, row.id)
        for (const f of row.fiscais) await notify({ tenantId, userId: f.userId, assunto: 'Avaliação remarcada', mensagem: msg, refType: 'CalExame', refId: row.id })
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: mudouData ? 'REMARCAR_PROVA' : 'ATUALIZAR_PROVA', refType: 'CalExame', refId: atual.id, detalhes: { antes: { inicio: atual.inicio, fim: atual.fim, spaceId: atual.spaceId }, depois: { inicio: row.inicio, fim: row.fim, spaceId: row.spaceId }, motivo } })
      res.json({ avaliacao: row, avisos: v.avisos })
    }),
  )

  const TRANSICOES: Record<string, string[]> = { AGENDADA: ['CONFIRMADA', 'REALIZADA', 'CANCELADA'], CONFIRMADA: ['REALIZADA', 'CANCELADA'], REALIZADA: [], CANCELADA: [], REMARCADA: [] }
  router.post(
    '/provas/:id/status',
    requireRole('TEACHER', ...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ status: z.enum(['CONFIRMADA', 'REALIZADA', 'CANCELADA']), motivo: z.string().max(500).optional() }), req.body)
      const e = await carregarExame(tenantId, String(req.params.id))
      if (!podeGerir(req, e)) throw erro(403, 'Sem permissão.')
      if (!TRANSICOES[e.status].includes(b.status)) throw erro(409, `Transição inválida: ${e.status} → ${b.status}.`)
      if (b.status === 'REALIZADA' && e.inicio.getTime() > Date.now()) throw erro(409, 'A avaliação ainda não começou.')
      if (b.status === 'CANCELADA' && !b.motivo) throw erro(400, 'Informe o motivo do cancelamento.')
      const row = await prisma.calExame.update({ where: { id: e.id }, data: { status: b.status } })
      if (b.status === 'CANCELADA') {
        await cancelReminders({ tenantId, refType: 'CalExame', refId: e.id })
        await notificarAlunos(tenantId, e.classSectionId, 'Avaliação cancelada', `A avaliação "${e.titulo}" prevista para ${fmt(e.inicio)} foi cancelada. Motivo: ${b.motivo}. Aguarde nova data.`, e.id)
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: `PROVA_${b.status}`, refType: 'CalExame', refId: e.id, detalhes: { de: e.status, motivo: b.motivo } })
      res.json(row)
    }),
  )

  router.post(
    '/provas/:id/fiscais',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(fiscalIn, req.body)
      const e = await carregarExame(tenantId, String(req.params.id))
      if (e.status === 'CANCELADA' || e.status === 'REALIZADA') throw erro(409, 'Avaliação encerrada.')
      if (!(await prisma.user.findFirst({ where: { id: b.userId, tenantId }, select: { id: true } }))) throw erro(404, 'Usuário não encontrado.')
      const term = await requireTerm(tenantId, e.termId)
      const v = await validarExame(tenantId, { id: e.id, termId: e.termId, classSectionId: e.classSectionId, grupo: e.grupo, spaceId: e.spaceId, professorUserId: e.professorUserId, fiscais: [...e.fiscais.map((f) => f.userId), b.userId], inicio: e.inicio, fim: e.fim, alunos: e.alunosPrevistos ?? 0, tipo: e.tipo }, term)
      const fiscalMotivos = v.choques.filter((c) => c.tipo === 'FISCAL' && c.ref === b.userId)
      if (fiscalMotivos.length) return res.status(409).json({ error: 'Fiscal já escalado em outra avaliação neste horário.', conflitos: fiscalMotivos })
      const row = await prisma.calExameFiscal.upsert({ where: { exameId_userId: { exameId: e.id, userId: b.userId } }, create: { tenantId, exameId: e.id, userId: b.userId, papel: b.papel }, update: { papel: b.papel } })
      await agendarLembretesExame(tenantId, { ...e, professorUserId: null }, [b.userId])
      await notify({ tenantId, userId: b.userId, assunto: 'Escala de fiscalização', mensagem: `Você foi escalado(a) para "${e.titulo}" em ${fmt(e.inicio)}.`, refType: 'CalExame', refId: e.id })
      res.status(201).json(row)
    }),
  )

  router.delete(
    '/provas/:id/fiscais/:userId',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await carregarExame(tenantId, String(req.params.id))
      await prisma.calExameFiscal.deleteMany({ where: { exameId: e.id, userId: String(req.params.userId), tenantId } })
      await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: { startsWith: `cal:prova:${e.id}:fiscal:${String(req.params.userId)}:` }, status: { in: ['PENDENTE', 'NOTIFICADO'] } }, data: { status: 'CANCELADO' } })
      res.status(204).end()
    }),
  )

  router.post(
    '/provas/:id/fiscais/confirmar',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const e = await carregarExame(tenantId, String(req.params.id))
      const r = await prisma.calExameFiscal.updateMany({ where: { exameId: e.id, tenantId, userId: getUserId(req) }, data: { confirmado: true } })
      if (!r.count) return res.status(404).json({ error: 'Você não está escalado(a) nesta avaliação.' })
      res.json({ confirmado: true })
    }),
  )

  router.post(
    '/provas/:id/segunda-chamada',
    requireRole('TEACHER', ...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const orig = await carregarExame(tenantId, String(req.params.id))
      if (!podeGerir(req, orig)) throw erro(403, 'Sem permissão.')
      if (orig.tipo === 'SEGUNDA_CHAMADA') throw erro(409, 'Já é uma segunda chamada.')
      if (orig.status === 'CANCELADA') throw erro(409, 'A avaliação original foi cancelada.')
      const b = parseBody(z.object({ inicio: dateISO(), fim: dateISO(), spaceId: z.string().nullish(), fiscais: z.array(fiscalIn).max(20).default([]), observacoes: z.string().max(1000).nullish() }), req.body)
      if (orig.segundaChamadaInicio && orig.segundaChamadaFim && (b.inicio.getTime() < orig.segundaChamadaInicio.getTime() || b.fim.getTime() > orig.segundaChamadaFim.getTime()))
        return res.status(409).json({ error: `A segunda chamada deve ocorrer dentro da janela ${fmt(orig.segundaChamadaInicio)} a ${fmt(orig.segundaChamadaFim)}.` })
      if (b.spaceId) await requireSpace(tenantId, b.spaceId)
      const term = await requireTerm(tenantId, orig.termId)
      const solicitantes = await prisma.calExame.count({ where: { tenantId, originalId: orig.id, status: { notIn: ['CANCELADA', 'REMARCADA'] } } })
      const v = await validarExame(tenantId, { termId: orig.termId, classSectionId: orig.classSectionId, grupo: orig.grupo, spaceId: b.spaceId ?? null, professorUserId: orig.professorUserId, fiscais: b.fiscais.map((f) => f.userId), inicio: b.inicio, fim: b.fim, alunos: Math.min(orig.alunosPrevistos ?? 0, 60), tipo: 'SEGUNDA_CHAMADA' }, term)
      if (v.duros.length) return res.status(409).json({ error: 'Não é possível agendar a segunda chamada.', motivos: v.duros, avisos: v.avisos })
      const row = await prisma.calExame.create({
        data: { tenantId, termId: orig.termId, classSectionId: orig.classSectionId, disciplineId: orig.disciplineId, assessmentId: orig.assessmentId, grupo: orig.grupo, titulo: `${orig.titulo} — 2ª chamada`, tipo: 'SEGUNDA_CHAMADA', inicio: b.inicio, fim: b.fim, spaceId: b.spaceId ?? null, professorUserId: orig.professorUserId, alunosPrevistos: null, originalId: orig.id, observacoes: b.observacoes ?? null, criadoPorId: userId, fiscais: { create: b.fiscais.map((f) => ({ tenantId, userId: f.userId, papel: f.papel })) } },
        include: { fiscais: true },
      })
      await agendarLembretesExame(tenantId, row, b.fiscais.map((f) => f.userId))
      await audit({ tenantId, userId, modulo: MODULO, acao: 'AGENDAR_SEGUNDA_CHAMADA', refType: 'CalExame', refId: row.id, detalhes: { originalId: orig.id } })
      res.status(201).json({ avaliacao: row, avisos: v.avisos, segundasChamadasDaOriginal: solicitantes + 1 })
    }),
  )
}
