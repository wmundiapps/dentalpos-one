import { Router, Response } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, pageParams, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { janelasLivres } from './conflicts'
import { DAY_MS, addDays, expandRecorrencia, hhmmToMin, localDateKey, localMinutes, minToHHMM, slotInstant, startOfLocalDay, toLocal } from './time'
import {
  APROVADORES_ESPACO, MODULO, SOLICITANTES, OcupacaoDoEspaco, carregarOcupacaoEspaco, erro, nomesUsuarios, registrarConflitoManual,
  requireSpace, resolverConflitosDoRegistro, sobrepoe, temPapel, toStrArray,
} from './service'

const MAX_OCORRENCIAS = 120

const reservaCreate = z.object({
  spaceId: z.string().min(1),
  titulo: z.string().min(3).max(200),
  finalidade: z.string().max(2000).nullish(),
  tipo: z.enum(['EVENTO', 'AULA_EXTRA', 'REUNIAO', 'PROVA', 'OUTRO']).default('EVENTO'),
  inicio: dateISO(),
  fim: dateISO(),
  participantes: z.number().int().min(0).max(100000).nullish(),
  classSectionId: z.string().nullish(),
  professorUserId: z.string().nullish(),
  recursosSolicitados: z.array(z.string()).max(30).default([]),
  recorrencia: z.enum(['NENHUMA', 'DIARIA', 'SEMANAL', 'QUINZENAL', 'MENSAL']).default('NENHUMA'),
  recorrenciaIntervalo: z.number().int().min(1).max(12).default(1),
  recorrenciaAte: dateISO().nullish(),
  diasSemana: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  pularConflitos: z.boolean().default(false),
  aprovarDireto: z.boolean().optional(),
  observacoes: z.string().max(2000).nullish(),
})

export interface ConflitoReserva {
  ocorrencia: { inicio: Date; fim: Date }
  com: Array<{ tipo: string; id: string; titulo: string; inicio: Date; fim: Date }>
}

function conflitosDe(occ: Array<{ inicio: Date; fim: Date }>, ocup: OcupacaoDoEspaco[]): ConflitoReserva[] {
  const out: ConflitoReserva[] = []
  for (const o of occ) {
    const com = ocup.filter((x) => sobrepoe(o, x)).map((x) => ({ tipo: x.tipo, id: x.id, titulo: x.titulo, inicio: x.inicio, fim: x.fim }))
    if (com.length) out.push({ ocorrencia: o, com })
  }
  return out
}

const rotuloTipo: Record<string, string> = { RESERVA: 'reserva aprovada', BLOQUEIO: 'bloqueio do espaço', PROVA: 'avaliação agendada', AULA: 'aula da grade horária' }
const fmt = (d: Date) => {
  const l = toLocal(d)
  return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()} ${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`
}

export function registerReservas(router: Router) {
  // ---------- Solicitar reserva (pontual ou série) ----------
  router.post(
    '/reservas',
    requireRole(...SOLICITANTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(reservaCreate, req.body)
      const espaco = await requireSpace(tenantId, b.spaceId)
      if (b.fim.getTime() <= b.inicio.getTime()) throw erro(400, 'O fim deve ser posterior ao início.')
      if (b.fim.getTime() - b.inicio.getTime() > 16 * 3_600_000) throw erro(400, 'Uma ocorrência não pode passar de 16 horas.')
      if (b.recorrencia !== 'NENHUMA' && !b.recorrenciaAte) throw erro(400, 'Informe "recorrenciaAte" para reservas recorrentes.')
      const podeAprovar = temPapel(req.user?.role, ...APROVADORES_ESPACO)
      if (!podeAprovar && b.inicio.getTime() < Date.now() - 5 * 60_000) throw erro(400, 'Não é possível solicitar reserva no passado.')
      if (b.participantes && espaco.capacidade > 0 && b.participantes > espaco.capacidade)
        throw erro(409, `O espaço comporta ${espaco.capacidade} pessoas e a reserva prevê ${b.participantes}.`)
      const tem = new Set(toStrArray(espaco.recursos).map((r) => r.toLowerCase()))
      const faltam = b.recursosSolicitados.filter((r) => !tem.has(r.toLowerCase()))
      if (faltam.length) throw erro(409, `O espaço não possui os recursos solicitados: ${faltam.join(', ')}.`)

      const occ = expandRecorrencia({ inicio: b.inicio, fim: b.fim, recorrencia: b.recorrencia, intervalo: b.recorrenciaIntervalo, ate: b.recorrenciaAte, diasSemana: b.diasSemana, max: MAX_OCORRENCIAS })
      if (b.recorrencia !== 'NENHUMA' && occ.length >= MAX_OCORRENCIAS) throw erro(400, `Séries limitadas a ${MAX_OCORRENCIAS} ocorrências; reduza o período.`)
      const ocup = await carregarOcupacaoEspaco(tenantId, b.spaceId, occ[0].inicio, occ[occ.length - 1].fim)
      const conflitos = conflitosDe(occ, ocup)
      if (conflitos.length && !b.pularConflitos) {
        return res.status(409).json({
          error: `Conflito de agenda em ${conflitos.length} ocorrência(s).`,
          conflitos: conflitos.map((c) => ({ ocorrencia: c.ocorrencia, com: c.com.map((x) => ({ ...x, descricao: `${rotuloTipo[x.tipo] ?? x.tipo}: ${x.titulo} (${fmt(x.inicio)}–${fmt(x.fim)})` })) })),
        })
      }
      const bad = new Set(conflitos.map((c) => c.ocorrencia.inicio.getTime()))
      const livres = occ.filter((o) => !bad.has(o.inicio.getTime()))
      if (!livres.length) throw erro(409, 'Todas as ocorrências conflitam com a agenda do espaço.')
      const status = podeAprovar && (b.aprovarDireto ?? true) ? 'APROVADA' : 'PENDENTE'
      const serieId = livres.length > 1 ? randomUUID() : null
      const base = {
        tenantId, spaceId: b.spaceId, titulo: b.titulo, finalidade: b.finalidade ?? null, tipo: b.tipo as any, status: status as any, solicitanteId: userId,
        classSectionId: b.classSectionId ?? null, professorUserId: b.professorUserId ?? null, participantes: b.participantes ?? null,
        recursosSolicitados: b.recursosSolicitados as any, serieId, recorrencia: b.recorrencia as any, recorrenciaAte: b.recorrenciaAte ?? null, observacoes: b.observacoes ?? null,
        decididoPorId: status === 'APROVADA' ? userId : null, decididoEm: status === 'APROVADA' ? new Date() : null,
      }
      const criadas = await prisma.$transaction(livres.map((o) => prisma.calReserva.create({ data: { ...base, inicio: o.inicio, fim: o.fim } })))
      const refId = serieId ?? criadas[0].id
      if (status === 'PENDENTE') {
        await scheduleReminder({
          tenantId, modulo: MODULO, refType: 'CalReserva', refId,
          titulo: `Aprovar reserva de espaço: ${b.titulo}`,
          descricao: `${espaco.codigo} — ${fmt(livres[0].inicio)}${livres.length > 1 ? ` (+${livres.length - 1} ocorrências)` : ''}`,
          dueAt: new Date(Math.max(Date.now() + 3_600_000, Math.min(livres[0].inicio.getTime(), Date.now() + 2 * DAY_MS))),
          antecedenciaDias: 1, severity: 'ATENCAO', assigneeRole: 'FACILITIES', dedupeKey: `cal:reserva:${refId}`,
        })
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: 'SOLICITAR_RESERVA', refType: 'CalReserva', refId, detalhes: { spaceId: b.spaceId, ocorrencias: criadas.length, status } })
      res.status(201).json({ status, serieId, criadas: criadas.length, ignoradasPorConflito: conflitos.length, reservas: criadas, conflitosIgnorados: conflitos.map((c) => c.ocorrencia) })
    }),
  )

  // ---------- Listagens ----------
  router.get(
    '/reservas',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const { skip, take, page, pageSize } = pageParams(req.query)
      const aprovador = temPapel(req.user?.role, ...APROVADORES_ESPACO)
      const de = qs(req.query.de) ? new Date(qs(req.query.de)!) : undefined
      const ate = qs(req.query.ate) ? new Date(qs(req.query.ate)!) : undefined
      const where: any = {
        tenantId,
        ...(aprovador ? {} : { solicitanteId: getUserId(req) }),
        ...(qs(req.query.spaceId) ? { spaceId: qs(req.query.spaceId) } : {}),
        ...(qs(req.query.status) ? { status: qs(req.query.status) } : {}),
        ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) } : {}),
        ...(qs(req.query.bloqueio) ? { bloqueio: qs(req.query.bloqueio) === 'true' } : {}),
        ...(aprovador && qs(req.query.solicitanteId) ? { solicitanteId: qs(req.query.solicitanteId) } : {}),
        ...(de || ate ? { inicio: { ...(ate ? { lt: ate } : {}) }, fim: { ...(de ? { gt: de } : {}) } } : {}),
      }
      const [items, total] = await Promise.all([prisma.calReserva.findMany({ where, orderBy: { inicio: 'asc' }, skip, take }), prisma.calReserva.count({ where })])
      res.json({ items, total, page, pageSize })
    }),
  )

  router.get(
    '/reservas/minhas',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const items = await prisma.calReserva.findMany({ where: { tenantId: getTenantId(req), solicitanteId: getUserId(req), fim: { gte: new Date() } }, orderBy: { inicio: 'asc' }, take: 200 })
      res.json({ items })
    }),
  )

  // Fila de pedidos pendentes de aprovação, com indicação de disputa e de choque com a agenda.
  router.get(
    '/reservas/fila',
    requireRole(...APROVADORES_ESPACO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const pend = await prisma.calReserva.findMany({ where: { tenantId, status: 'PENDENTE', fim: { gte: new Date() } }, orderBy: { inicio: 'asc' }, take: 300 })
      const nomes = await nomesUsuarios(tenantId, pend.map((p) => p.solicitanteId))
      const espacos = await prisma.eduSpace.findMany({ where: { tenantId, id: { in: [...new Set(pend.map((p) => p.spaceId))] } }, select: { id: true, codigo: true, nome: true, capacidade: true } })
      const em = new Map(espacos.map((e) => [e.id, e]))
      const itens: any[] = []
      for (const p of pend) {
        const concorrentes = pend.filter((o) => o.id !== p.id && o.spaceId === p.spaceId && sobrepoe(p, o)).map((o) => o.id)
        const ocup = await carregarOcupacaoEspaco(tenantId, p.spaceId, p.inicio, p.fim)
        itens.push({ ...p, solicitante: nomes.get(p.solicitanteId) ?? null, espaco: em.get(p.spaceId) ?? null, concorrentes, choqueComAgenda: ocup.map((o) => ({ tipo: o.tipo, titulo: o.titulo, inicio: o.inicio, fim: o.fim })) })
      }
      res.json({ total: itens.length, itens })
    }),
  )

  router.get(
    '/reservas/:id',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.calReserva.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
      if (r.solicitanteId !== getUserId(req) && !temPapel(req.user?.role, ...APROVADORES_ESPACO)) return res.status(403).json({ error: 'Sem permissão.' })
      res.json(r)
    }),
  )

  router.patch(
    '/reservas/:id',
    requireRole(...SOLICITANTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const r = await prisma.calReserva.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
      if (r.solicitanteId !== getUserId(req) && !temPapel(req.user?.role, ...APROVADORES_ESPACO)) return res.status(403).json({ error: 'Sem permissão.' })
      if (r.status !== 'PENDENTE' && r.status !== 'APROVADA') throw erro(409, 'Reserva encerrada não pode ser alterada.')
      const d = parseBody(z.object({ titulo: z.string().min(3).max(200), finalidade: z.string().max(2000).nullable(), participantes: z.number().int().min(0).nullable(), observacoes: z.string().max(2000).nullable() }).partial(), req.body)
      res.json(await prisma.calReserva.update({ where: { id: r.id }, data: d }))
    }),
  )

  // ---------- Decisão ----------
  async function alvos(tenantId: string, id: string, escopo: string) {
    const r = await prisma.calReserva.findFirst({ where: { id, tenantId } })
    if (!r) throw erro(404, 'Reserva não encontrada.')
    if (escopo === 'serie' && r.serieId) return { ref: r, lista: await prisma.calReserva.findMany({ where: { tenantId, serieId: r.serieId, status: 'PENDENTE' }, orderBy: { inicio: 'asc' } }) }
    return { ref: r, lista: r.status === 'PENDENTE' ? [r] : [] }
  }

  router.post(
    '/reservas/:id/aprovar',
    requireRole(...APROVADORES_ESPACO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ escopo: z.enum(['ocorrencia', 'serie']).default('serie'), rejeitarConcorrentes: z.boolean().default(false), observacao: z.string().max(500).optional() }), req.body ?? {})
      const { ref, lista } = await alvos(tenantId, String(req.params.id), b.escopo)
      if (!lista.length) throw erro(409, 'Não há solicitações pendentes para aprovar.')
      const ocup = await carregarOcupacaoEspaco(tenantId, ref.spaceId, lista[0].inicio, lista[lista.length - 1].fim)
      const aprovadas: string[] = []
      const recusadasPorConflito: Array<{ id: string; inicio: Date; com: string[] }> = []
      for (const r of lista) {
        const c = ocup.filter((x) => sobrepoe(r, x))
        if (c.length) {
          recusadasPorConflito.push({ id: r.id, inicio: r.inicio, com: c.map((x) => `${rotuloTipo[x.tipo]}: ${x.titulo}`) })
          continue
        }
        await prisma.calReserva.update({ where: { id: r.id }, data: { status: 'APROVADA', decididoPorId: userId, decididoEm: new Date(), motivoDecisao: b.observacao ?? null } })
        ocup.push({ tipo: 'RESERVA', id: r.id, titulo: r.titulo, inicio: r.inicio, fim: r.fim })
        aprovadas.push(r.id)
      }
      if (!aprovadas.length) return res.status(409).json({ error: 'A agenda do espaço mudou: todas as ocorrências agora conflitam.', conflitos: recusadasPorConflito })
      let rejeitadas = 0
      if (b.rejeitarConcorrentes) {
        const ap = await prisma.calReserva.findMany({ where: { id: { in: aprovadas } } })
        const concorrentes = await prisma.calReserva.findMany({ where: { tenantId, spaceId: ref.spaceId, status: 'PENDENTE', id: { notIn: lista.map((l) => l.id) } } })
        for (const c of concorrentes.filter((c) => ap.some((a) => sobrepoe(a, c)))) {
          await prisma.calReserva.update({ where: { id: c.id }, data: { status: 'REJEITADA', decididoPorId: userId, decididoEm: new Date(), motivoDecisao: 'Espaço concedido a outra solicitação no mesmo horário.' } })
          await notify({ tenantId, userId: c.solicitanteId, assunto: 'Reserva de espaço não aprovada', mensagem: `Sua solicitação "${c.titulo}" (${fmt(c.inicio)}) não foi aprovada: espaço concedido a outra solicitação no mesmo horário.`, refType: 'CalReserva', refId: c.id })
          rejeitadas++
        }
      }
      if (!recusadasPorConflito.length) await completeReminders({ tenantId, refType: 'CalReserva', refId: ref.serieId ?? ref.id, userId })
      await notify({ tenantId, userId: ref.solicitanteId, assunto: 'Reserva de espaço aprovada', mensagem: `Sua reserva "${ref.titulo}" foi aprovada (${aprovadas.length} ocorrência(s)), a partir de ${fmt(lista[0].inicio)}.`, refType: 'CalReserva', refId: ref.id })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'APROVAR_RESERVA', refType: 'CalReserva', refId: ref.id, detalhes: { aprovadas: aprovadas.length, conflitos: recusadasPorConflito.length, rejeitadasConcorrentes: rejeitadas } })
      res.json({ aprovadas: aprovadas.length, pendentesPorConflito: recusadasPorConflito, concorrentesRejeitadas: rejeitadas })
    }),
  )

  router.post(
    '/reservas/:id/rejeitar',
    requireRole(...APROVADORES_ESPACO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ motivo: z.string().min(3).max(500), escopo: z.enum(['ocorrencia', 'serie']).default('serie') }), req.body)
      const { ref, lista } = await alvos(tenantId, String(req.params.id), b.escopo)
      if (!lista.length) throw erro(409, 'Não há solicitações pendentes para rejeitar.')
      await prisma.calReserva.updateMany({ where: { id: { in: lista.map((l) => l.id) } }, data: { status: 'REJEITADA', decididoPorId: userId, decididoEm: new Date(), motivoDecisao: b.motivo } })
      await completeReminders({ tenantId, refType: 'CalReserva', refId: ref.serieId ?? ref.id, userId })
      await notify({ tenantId, userId: ref.solicitanteId, assunto: 'Reserva de espaço não aprovada', mensagem: `Sua solicitação "${ref.titulo}" não foi aprovada. Motivo: ${b.motivo}`, refType: 'CalReserva', refId: ref.id })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'REJEITAR_RESERVA', refType: 'CalReserva', refId: ref.id, detalhes: { motivo: b.motivo, ocorrencias: lista.length } })
      res.json({ rejeitadas: lista.length })
    }),
  )

  router.post(
    '/reservas/:id/cancelar',
    requireRole(...SOLICITANTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ escopo: z.enum(['ocorrencia', 'serie']).default('ocorrencia'), motivo: z.string().max(500).optional() }), req.body ?? {})
      const r = await prisma.calReserva.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!r) return res.status(404).json({ error: 'Reserva não encontrada.' })
      if (r.bloqueio) throw erro(409, 'Bloqueios são cancelados em DELETE /bloqueios/:id.')
      const aprovador = temPapel(req.user?.role, ...APROVADORES_ESPACO)
      if (r.solicitanteId !== userId && !aprovador) return res.status(403).json({ error: 'Somente o solicitante ou a gestão de espaços pode cancelar.' })
      const where: any = b.escopo === 'serie' && r.serieId ? { tenantId, serieId: r.serieId, status: { in: ['PENDENTE', 'APROVADA'] }, inicio: { gte: r.inicio } } : { id: r.id, status: { in: ['PENDENTE', 'APROVADA'] } }
      const n = await prisma.calReserva.updateMany({ where, data: { status: 'CANCELADA', decididoPorId: userId, decididoEm: new Date(), motivoDecisao: b.motivo ?? 'Cancelada' } })
      if (!n.count) throw erro(409, 'Reserva já encerrada.')
      await completeReminders({ tenantId, refType: 'CalReserva', refId: r.serieId ?? r.id, userId })
      if (r.solicitanteId !== userId) await notify({ tenantId, userId: r.solicitanteId, assunto: 'Reserva de espaço cancelada', mensagem: `Sua reserva "${r.titulo}" (${fmt(r.inicio)}) foi cancelada pela gestão de espaços.${b.motivo ? ' Motivo: ' + b.motivo : ''}`, refType: 'CalReserva', refId: r.id })
      await audit({ tenantId, userId, modulo: MODULO, acao: 'CANCELAR_RESERVA', refType: 'CalReserva', refId: r.id, detalhes: { escopo: b.escopo, canceladas: n.count } })
      res.json({ canceladas: n.count })
    }),
  )

  // ---------- Bloqueios (manutenção/limpeza) ----------
  router.post(
    '/bloqueios',
    requireRole('FACILITIES', 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(
        z.object({
          spaceIds: z.array(z.string()).min(1).max(50),
          titulo: z.string().min(3).max(200),
          motivo: z.string().max(1000).nullish(),
          tipo: z.enum(['MANUTENCAO', 'LIMPEZA', 'OUTRO']).default('MANUTENCAO'),
          inicio: dateISO(),
          fim: dateISO(),
          recorrencia: z.enum(['NENHUMA', 'DIARIA', 'SEMANAL', 'QUINZENAL', 'MENSAL']).default('NENHUMA'),
          recorrenciaIntervalo: z.number().int().min(1).max(12).default(1),
          recorrenciaAte: dateISO().nullish(),
          diasSemana: z.array(z.number().int().min(1).max(7)).optional(),
          cancelarConflitantes: z.boolean().default(false),
        }),
        req.body,
      )
      if (b.fim.getTime() <= b.inicio.getTime()) throw erro(400, 'O fim deve ser posterior ao início.')
      if (b.recorrencia !== 'NENHUMA' && !b.recorrenciaAte) throw erro(400, 'Informe "recorrenciaAte".')
      const occ = expandRecorrencia({ inicio: b.inicio, fim: b.fim, recorrencia: b.recorrencia, intervalo: b.recorrenciaIntervalo, ate: b.recorrenciaAte, diasSemana: b.diasSemana, max: MAX_OCORRENCIAS })
      const resultado: any[] = []
      for (const spaceId of b.spaceIds) {
        await requireSpace(tenantId, spaceId)
        const de = occ[0].inicio
        const ate = occ[occ.length - 1].fim
        const ocup = await carregarOcupacaoEspaco(tenantId, spaceId, de, ate)
        const reservasConf = ocup.filter((o) => (o.tipo === 'RESERVA' || o.tipo === 'BLOQUEIO') && occ.some((x) => sobrepoe(x, o)))
        const aulas = ocup.filter((o) => o.tipo === 'AULA' && occ.some((x) => sobrepoe(x, o)))
        const provas = ocup.filter((o) => o.tipo === 'PROVA' && occ.some((x) => sobrepoe(x, o)))
        const onlyReservas = reservasConf.filter((r) => r.tipo === 'RESERVA')
        if (onlyReservas.length && !b.cancelarConflitantes) {
          return res.status(409).json({ error: `Há ${onlyReservas.length} reserva(s) aprovada(s) em conflito. Reenvie com "cancelarConflitantes": true para cancelá-las e notificar os solicitantes.`, espaco: spaceId, reservas: onlyReservas })
        }
        const serieId = occ.length > 1 ? randomUUID() : null
        const criados = await prisma.$transaction(
          occ.map((o) => prisma.calReserva.create({ data: { tenantId, spaceId, titulo: b.titulo, finalidade: b.motivo ?? null, tipo: b.tipo as any, status: 'APROVADA', bloqueio: true, inicio: o.inicio, fim: o.fim, solicitanteId: userId, serieId, recorrencia: b.recorrencia as any, recorrenciaAte: b.recorrenciaAte ?? null, decididoPorId: userId, decididoEm: new Date() } })),
        )
        let canceladas = 0
        for (const r of onlyReservas) {
          const row = await prisma.calReserva.findUnique({ where: { id: r.id } })
          if (!row || row.status !== 'APROVADA') continue
          await prisma.calReserva.update({ where: { id: r.id }, data: { status: 'CANCELADA', decididoPorId: userId, decididoEm: new Date(), motivoDecisao: `Espaço bloqueado: ${b.titulo}` } })
          await notify({ tenantId, userId: row.solicitanteId, assunto: 'Reserva cancelada por bloqueio do espaço', mensagem: `Sua reserva "${row.titulo}" (${fmt(row.inicio)}) foi cancelada: o espaço ficará indisponível (${b.titulo}). Solicite outro espaço.`, refType: 'CalReserva', refId: row.id })
          await registrarConflitoManual(tenantId, null, { tipo: 'RESERVA', chave: `bloq:${criados[0].id}:reserva:${r.id}`, descricao: `Reserva "${r.titulo}" cancelada por bloqueio "${b.titulo}"` })
          await resolverConflitosDoRegistro(tenantId, r.id, userId)
          canceladas++
        }
        // aulas/provas afetadas: sinaliza e avisa os professores
        const afetadas: Array<{ tipo: string; id: string; inicio: Date }> = []
        const slots = aulas.length ? await prisma.calSlot.findMany({ where: { id: { in: [...new Set(aulas.map((a) => a.id))] } } }) : []
        const smap = new Map(slots.map((s) => [s.id, s]))
        for (const a of aulas) {
          const s = smap.get(a.id)
          await registrarConflitoManual(tenantId, s?.termId ?? null, { tipo: 'ESPACO', chave: `bloq:${criados[0].id}:slot:${a.id}:${localDateKey(a.inicio)}`, descricao: `Aula sem espaço em ${fmt(a.inicio)}: bloqueio "${b.titulo}"`, detalhes: { slotId: a.id, spaceId } })
          afetadas.push({ tipo: 'AULA', id: a.id, inicio: a.inicio })
          if (s?.professorUserId && afetadas.length <= 100) await notify({ tenantId, userId: s.professorUserId, assunto: 'Aula afetada por bloqueio de espaço', mensagem: `A aula de ${fmt(a.inicio)} está sem espaço: o local ficará bloqueado (${b.titulo}). A coordenação providenciará nova sala.`, refType: 'CalSlot', refId: a.id })
        }
        for (const p of provas) {
          const ex = await prisma.calExame.findUnique({ where: { id: p.id } })
          await registrarConflitoManual(tenantId, ex?.termId ?? null, { tipo: 'PROVA', chave: `bloq:${criados[0].id}:prova:${p.id}`, descricao: `Avaliação "${p.titulo}" em ${fmt(p.inicio)} está em espaço bloqueado` })
          afetadas.push({ tipo: 'PROVA', id: p.id, inicio: p.inicio })
          if (ex?.professorUserId) await notify({ tenantId, userId: ex.professorUserId, assunto: 'Avaliação em espaço bloqueado', mensagem: `A avaliação "${p.titulo}" (${fmt(p.inicio)}) está em espaço bloqueado (${b.titulo}). Remarque a sala.`, refType: 'CalExame', refId: p.id })
        }
        resultado.push({ spaceId, bloqueios: criados.length, serieId, reservasCanceladas: canceladas, aulasEProvasAfetadas: afetadas })
      }
      await audit({ tenantId, userId, modulo: MODULO, acao: 'BLOQUEAR_ESPACO', detalhes: { espacos: b.spaceIds, titulo: b.titulo } })
      res.status(201).json({ resultado })
    }),
  )

  router.delete(
    '/bloqueios/:id',
    requireRole('FACILITIES', 'COORDINATOR'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const escopo = qs(req.query.escopo) === 'serie' ? 'serie' : 'ocorrencia'
      const r = await prisma.calReserva.findFirst({ where: { id: String(req.params.id), tenantId, bloqueio: true } })
      if (!r) return res.status(404).json({ error: 'Bloqueio não encontrado.' })
      const where: any = escopo === 'serie' && r.serieId ? { tenantId, serieId: r.serieId, status: 'APROVADA' } : { id: r.id }
      const ids = (await prisma.calReserva.findMany({ where, select: { id: true } })).map((x) => x.id)
      await prisma.calReserva.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELADA', decididoPorId: userId, decididoEm: new Date() } })
      for (const id of ids) await resolverConflitosDoRegistro(tenantId, id, userId)
      await audit({ tenantId, userId, modulo: MODULO, acao: 'LIBERAR_BLOQUEIO', refType: 'CalReserva', refId: r.id, detalhes: { removidos: ids.length } })
      res.json({ liberados: ids.length })
    }),
  )

  // ---------- Disponibilidade ----------
  async function agendaDoEspaco(tenantId: string, spaceId: string, de: Date, ate: Date) {
    return (await carregarOcupacaoEspaco(tenantId, spaceId, de, ate)).sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
  }

  router.get(
    '/espacos/livres',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const inicio = new Date(qs(req.query.inicio) ?? '')
      const fim = new Date(qs(req.query.fim) ?? '')
      if (isNaN(inicio.getTime()) || isNaN(fim.getTime()) || fim <= inicio) throw erro(400, 'Informe "inicio" e "fim" válidos (ISO 8601).')
      const cap = parseInt(qs(req.query.capacidade) ?? '0', 10) || 0
      const recursos = (qs(req.query.recursos) ?? '').split(',').map((r) => r.trim().toLowerCase()).filter(Boolean)
      const espacos = await prisma.eduSpace.findMany({
        where: { tenantId, ativo: true, capacidade: { gte: cap }, ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) as any } : {}), ...(qs(req.query.campusId) ? { campusId: qs(req.query.campusId) } : {}) },
        orderBy: { capacidade: 'asc' },
        take: 150,
      })
      const candidatos = espacos.filter((e) => recursos.every((r) => toStrArray(e.recursos).some((x) => x.toLowerCase() === r)))
      const livres: any[] = []
      for (let i = 0; i < candidatos.length; i += 10) {
        const lote = candidatos.slice(i, i + 10)
        const ocs = await Promise.all(lote.map((e) => carregarOcupacaoEspaco(tenantId, e.id, inicio, fim)))
        lote.forEach((e, k) => {
          if (!ocs[k].length) livres.push({ id: e.id, codigo: e.codigo, nome: e.nome, tipo: e.tipo, capacidade: e.capacidade, recursos: toStrArray(e.recursos), bloco: e.bloco, andar: e.andar })
        })
      }
      res.json({ inicio, fim, total: livres.length, espacos: livres })
    }),
  )

  router.get(
    '/espacos/:id/disponibilidade',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const spaceId = String(req.params.id)
      const e = await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId } })
      if (!e) return res.status(404).json({ error: 'Espaço não encontrado.' })
      const dataIni = qs(req.query.data) ? new Date(qs(req.query.data)!) : new Date()
      if (isNaN(dataIni.getTime())) throw erro(400, 'Data inválida.')
      const dias = Math.min(31, Math.max(1, parseInt(qs(req.query.dias) ?? '7', 10) || 7))
      const abre = hhmmToMin(qs(req.query.abre) ?? '07:00')
      const fecha = hhmmToMin(qs(req.query.fecha) ?? '23:00')
      const min = Math.max(15, parseInt(qs(req.query.min) ?? '60', 10) || 60)
      const d0 = startOfLocalDay(dataIni)
      const ocup = await agendaDoEspaco(tenantId, spaceId, d0, addDays(d0, dias))
      const out: any[] = []
      for (let k = 0; k < dias; k++) {
        const dia = addDays(d0, k)
        const key = localDateKey(dia)
        const doDia = ocup.filter((o) => sobrepoe(o, { inicio: dia, fim: addDays(dia, 1) }))
        const iv = doDia.map((o) => [Math.max(0, Math.round((o.inicio.getTime() - dia.getTime()) / 60000)), Math.min(1440, Math.round((o.fim.getTime() - dia.getTime()) / 60000))] as [number, number])
        out.push({
          data: key,
          ocupacoes: doDia.map((o) => ({ tipo: o.tipo, titulo: o.titulo, inicio: o.inicio, fim: o.fim })),
          livres: janelasLivres(iv, abre, fecha, min).map(([a, b]) => ({ inicio: minToHHMM(a), fim: minToHHMM(b), inicioISO: slotInstant(dia, a), fimISO: slotInstant(dia, b) })),
        })
      }
      res.json({ espaco: { id: e.id, codigo: e.codigo, nome: e.nome, tipo: e.tipo, capacidade: e.capacidade, ativo: e.ativo }, dias: out })
    }),
  )

  router.get(
    '/espacos/:id/agenda',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const spaceId = String(req.params.id)
      if (!(await prisma.eduSpace.findFirst({ where: { id: spaceId, tenantId }, select: { id: true } }))) return res.status(404).json({ error: 'Espaço não encontrado.' })
      const base = qs(req.query.semana) ? new Date(qs(req.query.semana)!) : new Date()
      if (isNaN(base.getTime())) throw erro(400, 'Data inválida.')
      const l = startOfLocalDay(base)
      const wd = toLocal(l).getUTCDay() || 7
      const seg = addDays(l, -(wd - 1))
      const itens = await agendaDoEspaco(tenantId, spaceId, seg, addDays(seg, 7))
      res.json({ semanaInicio: localDateKey(seg), itens: itens.map((o) => ({ ...o, dia: localDateKey(o.inicio), horaInicio: minToHHMM(localMinutes(o.inicio)), horaFim: minToHHMM(localMinutes(o.fim)) })) })
    }),
  )

  // Verificação prévia de conflito (sem gravar) — útil nas telas de agendamento.
  router.post(
    '/conflitos/verificar',
    requireRole(...SOLICITANTES),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({ spaceId: z.string(), inicio: dateISO(), fim: dateISO(), ignorarReservaId: z.string().optional() }), req.body)
      await requireSpace(tenantId, b.spaceId)
      const ocup = await carregarOcupacaoEspaco(tenantId, b.spaceId, b.inicio, b.fim, { reservaIds: b.ignorarReservaId ? [b.ignorarReservaId] : [] })
      const c = ocup.filter((o) => sobrepoe(o, b))
      res.json({ livre: c.length === 0, conflitos: c.map((o) => ({ ...o, descricao: `${rotuloTipo[o.tipo]}: ${o.titulo}` })) })
    }),
  )
}

