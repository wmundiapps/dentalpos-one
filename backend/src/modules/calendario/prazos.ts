import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { dateISO, parseBody, qs } from '../core/crud'
import { audit, notify } from '../core/notify'
import { cancelReminders, completeReminders, scheduleReminder } from '../core/reminders'
import { agendaLembretes, nivelEscalonamento, prazoEfetivo, situacaoPrazo } from './deadlines'
import { toLocal } from './time'
import { GESTAO, MODULO, erro, nomesUsuarios, requireTerm, temPapel } from './service'
import { resolverTurmas } from './turmas'

const fmt = (d: Date) => {
  const l = toLocal(d)
  return `${String(l.getUTCDate()).padStart(2, '0')}/${String(l.getUTCMonth() + 1).padStart(2, '0')}/${l.getUTCFullYear()} ${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`
}

type PrazoRow = NonNullable<Awaited<ReturnType<typeof prisma.calPrazoNotas.findFirst>>>

export interface GradeDeadline {
  id: string
  termId: string
  tipo: string
  etapa: string | null
  titulo: string
  abertura: Date | null
  prazoOriginal: Date
  prazo: Date                 // prazo efetivo (considera prorrogações)
  situacao: 'NAO_ABERTO' | 'ABERTO' | 'VENCE_EM_BREVE' | 'ENCERRADO' | 'CANCELADO'
  aberto: boolean
  diasRestantes: number
  prorrogado: boolean
  concluido: boolean          // só quando professorUserId foi informado
}

/**
 * Prazo de lançamento vigente do período — consumido pelo módulo `notas`.
 * Escolhe, entre os prazos ativos do período (opcionalmente filtrando por tipo/etapa/curso/campus),
 * o mais específico (curso/campus > geral) e, havendo várias etapas, o primeiro ainda aberto
 * (ou o último encerrado). Com professorUserId, aplica a prorrogação individual.
 */
export async function getGradeDeadline(
  tenantId: string,
  termId: string,
  opts: { tipo?: string; etapa?: string; programId?: string | null; campusId?: string | null; professorUserId?: string | null; now?: Date } = {},
): Promise<GradeDeadline | null> {
  const now = opts.now ?? new Date()
  const rows = await prisma.calPrazoNotas.findMany({
    where: {
      tenantId,
      termId,
      ativo: true,
      tipo: (opts.tipo ?? 'LANCAMENTO_NOTAS') as any,
      ...(opts.etapa ? { etapa: opts.etapa } : {}),
      AND: [{ OR: [{ programId: null }, ...(opts.programId ? [{ programId: opts.programId }] : [])] }, { OR: [{ campusId: null }, ...(opts.campusId ? [{ campusId: opts.campusId }] : [])] }],
    },
    include: { excecoes: opts.professorUserId ? { where: { userId: opts.professorUserId } } : false, conclusoes: opts.professorUserId ? { where: { userId: opts.professorUserId } } : false },
  })
  if (!rows.length) return null
  const calc = rows.map((r: any) => {
    const exc: Date | null = r.excecoes?.[0]?.ate ?? null
    const s = situacaoPrazo(r, now, exc)
    return { r, s, especificidade: (r.programId ? 2 : 0) + (r.campusId ? 1 : 0) }
  })
  // mais específicos primeiro; depois: abertos por prazo crescente, depois encerrados do mais recente
  calc.sort((a, b) => {
    if (b.especificidade !== a.especificidade) return b.especificidade - a.especificidade
    const ra = a.s.situacao === 'ENCERRADO' ? 1 : 0
    const rb = b.s.situacao === 'ENCERRADO' ? 1 : 0
    if (ra !== rb) return ra - rb
    return ra === 0 ? a.s.efetivo.getTime() - b.s.efetivo.getTime() : b.s.efetivo.getTime() - a.s.efetivo.getTime()
  })
  const { r, s } = calc[0] as any
  return {
    id: r.id,
    termId: r.termId,
    tipo: r.tipo,
    etapa: r.etapa,
    titulo: r.titulo,
    abertura: r.abertura,
    prazoOriginal: r.prazo,
    prazo: s.efetivo,
    situacao: s.situacao,
    aberto: s.aberto,
    diasRestantes: s.diasRestantes,
    prorrogado: s.prorrogado,
    concluido: !!r.conclusoes?.length,
  }
}

/** O módulo `notas` chama quando o professor conclui o lançamento: encerra os lembretes dele. */
export async function registrarLancamentoConcluido(tenantId: string, p: { termId: string; professorUserId: string; tipo?: string; etapa?: string; origem?: string }) {
  const prazos = await prisma.calPrazoNotas.findMany({ where: { tenantId, termId: p.termId, ativo: true, tipo: (p.tipo ?? 'LANCAMENTO_NOTAS') as any, ...(p.etapa ? { etapa: p.etapa } : {}) } })
  for (const pr of prazos) await concluirPrazo(tenantId, pr.id, p.professorUserId, p.origem ?? 'notas')
  return prazos.length
}

async function concluirPrazo(tenantId: string, prazoId: string, userId: string, origem?: string) {
  await prisma.calPrazoConclusao.upsert({ where: { prazoId_userId: { prazoId, userId } }, create: { tenantId, prazoId, userId, origem }, update: {} })
  await prisma.eduReminder.updateMany({ where: { tenantId, dedupeKey: { startsWith: `cal:prazo:${prazoId}:${userId}:` }, status: { in: ['PENDENTE', 'NOTIFICADO', 'ADIADO'] } }, data: { status: 'CONCLUIDO', concluidoEm: new Date(), concluidoPorId: userId } })
}

/** Professores com turma no escopo do prazo (período + curso/campus opcionais). */
export async function professoresDoPrazo(tenantId: string, p: { termId: string; programId: string | null; campusId: string | null }): Promise<string[]> {
  const secs = await prisma.classSection.findMany({ where: { tenantId, termId: p.termId, ...(p.campusId ? { OR: [{ campusId: null }, { campusId: p.campusId }] } : {}) } })
  let lista = secs
  if (p.programId) {
    const info = await resolverTurmas(tenantId, secs)
    lista = secs.filter((s) => info.get(s.id)?.programId === p.programId)
  }
  return [...new Set(lista.map((s) => s.professorUserId))]
}

async function pendentes(tenantId: string, pr: PrazoRow) {
  const [profs, conc, exc] = await Promise.all([
    professoresDoPrazo(tenantId, pr),
    prisma.calPrazoConclusao.findMany({ where: { prazoId: pr.id } }),
    prisma.calPrazoExcecao.findMany({ where: { prazoId: pr.id } }),
  ])
  const feitos = new Set(conc.map((c) => c.userId))
  const em = new Map(exc.map((e) => [e.userId, e.ate]))
  return { todos: profs, pendentes: profs.filter((u) => !feitos.has(u)).map((u) => ({ userId: u, efetivo: prazoEfetivo(pr, em.get(u)) })), concluidos: profs.filter((u) => feitos.has(u)) }
}

export async function agendarLembretesPrazo(tenantId: string, pr: PrazoRow, now = new Date()) {
  const { pendentes: pend } = await pendentes(tenantId, pr)
  let n = 0
  for (const x of pend) {
    for (const l of agendaLembretes(x.efetivo, now)) {
      await scheduleReminder({
        tenantId, modulo: MODULO, refType: 'CalPrazoNotas', refId: pr.id,
        titulo: `Prazo de lançamento (${pr.etapa ?? pr.tipo}) ${l.dias === 1 ? 'vence amanhã' : `em ${l.dias} dias`}: ${pr.titulo}`,
        descricao: `Prazo final: ${fmt(x.efetivo)}. Conclua o lançamento de notas/diário no período.`,
        dueAt: x.efetivo, remindAt: l.remindAt, severity: l.dias === 1 ? 'CRITICO' : l.dias === 3 ? 'ATENCAO' : 'INFO',
        assigneeUserId: x.userId, dedupeKey: `cal:prazo:${pr.id}:${x.userId}:${x.efetivo.getTime()}:D${l.dias}`,
      })
      n++
    }
  }
  return n
}

/** Job diário: lembretes D-7/D-3/D-1 aos professores e escalonamento à coordenação/direção. */
export async function processarPrazos(now = new Date()) {
  const prazos = await prisma.calPrazoNotas.findMany({ where: { ativo: true, prazo: { gte: new Date(now.getTime() - 60 * 86_400_000) } }, take: 2000 })
  let lembretes = 0
  let escCoord = 0
  let escDirecao = 0
  for (const pr of prazos) {
    const tenantId = pr.tenantId
    const { pendentes: pend } = await pendentes(tenantId, pr)
    lembretes += await agendarLembretesPrazo(tenantId, pr, now)
    const vencidos = pend.filter((x) => x.efetivo.getTime() < now.getTime())
    if (!pend.length) {
      await completeReminders({ tenantId, refType: 'CalPrazoEscalonamento', refId: pr.id })
      continue
    }
    const nivel = vencidos.length ? nivelEscalonamento(prazoEfetivo(pr), now) : 0
    if (nivel >= 1 && vencidos.length) {
      const nomes = await nomesUsuarios(tenantId, vencidos.map((v) => v.userId))
      const lista = vencidos.slice(0, 15).map((v) => nomes.get(v.userId) ?? v.userId).join(', ')
      if (!pr.escalonadoCoordEm) {
        await scheduleReminder({
          tenantId, modulo: MODULO, refType: 'CalPrazoEscalonamento', refId: pr.id, severity: 'ATENCAO', assigneeRole: 'COORDINATOR', recorrenciaDias: 2,
          titulo: `Prazo de notas vencido: ${vencidos.length} professor(es) pendente(s) — ${pr.titulo}`, descricao: `Pendentes: ${lista}${vencidos.length > 15 ? '…' : ''}.`,
          dueAt: now, remindAt: now, dedupeKey: `cal:prazo:esc1:${pr.id}`,
        })
        for (const v of vencidos) await notify({ tenantId, userId: v.userId, assunto: 'Prazo de lançamento vencido', mensagem: `O prazo "${pr.titulo}" venceu em ${fmt(v.efetivo)}. Regularize o lançamento ou solicite prorrogação à coordenação.`, refType: 'CalPrazoNotas', refId: pr.id })
        await prisma.calPrazoNotas.update({ where: { id: pr.id }, data: { escalonadoCoordEm: now } })
        escCoord++
      }
      if (nivel === 2 && !pr.escalonadoDirecaoEm) {
        await scheduleReminder({
          tenantId, modulo: MODULO, refType: 'CalPrazoEscalonamento', refId: pr.id, severity: 'CRITICO', assigneeRole: 'RECTOR', recorrenciaDias: 3,
          titulo: `ESCALONADO — prazo de notas vencido há 3+ dias: ${pr.titulo}`, descricao: `${vencidos.length} professor(es) ainda pendente(s): ${lista}.`, dueAt: now, remindAt: now, dedupeKey: `cal:prazo:esc2:${pr.id}`,
        })
        await prisma.calPrazoNotas.update({ where: { id: pr.id }, data: { escalonadoDirecaoEm: now } })
        escDirecao++
      }
    }
  }
  return { prazos: prazos.length, lembretesAgendados: lembretes, escalonadosCoordenacao: escCoord, escalonadosDirecao: escDirecao }
}

const prazoBase = z.object({
  termId: z.string().min(1),
  programId: z.string().nullish(),
  campusId: z.string().nullish(),
  tipo: z.enum(['LANCAMENTO_NOTAS', 'DIARIO_CLASSE', 'FECHAMENTO_FINAL', 'REVISAO_NOTAS', 'RECUPERACAO']).default('LANCAMENTO_NOTAS'),
  etapa: z.string().max(40).nullish(),
  titulo: z.string().min(3).max(200),
  abertura: dateISO().nullish(),
  prazo: dateISO(),
  observacoes: z.string().max(2000).nullish(),
  ativo: z.boolean().optional(),
})

export function registerPrazos(router: Router) {
  router.get(
    '/prazos',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const rows = await prisma.calPrazoNotas.findMany({
        where: { tenantId, ...(qs(req.query.termId) ? { termId: qs(req.query.termId) } : {}), ...(qs(req.query.tipo) ? { tipo: qs(req.query.tipo) as any } : {}), ...(qs(req.query.ativo) ? { ativo: qs(req.query.ativo) === 'true' } : {}) },
        orderBy: { prazo: 'asc' },
        take: 500,
      })
      res.json({ items: rows.map((r) => ({ ...r, ...situacaoPrazo(r) })) })
    }),
  )

  router.get(
    '/prazos/vigente',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const termId = qs(req.query.termId)
      if (!termId) throw erro(400, 'Informe termId.')
      const d = await getGradeDeadline(getTenantId(req), termId, { tipo: qs(req.query.tipo), etapa: qs(req.query.etapa), programId: qs(req.query.programId), campusId: qs(req.query.campusId), professorUserId: qs(req.query.professorUserId) ?? (req.user?.role === 'TEACHER' ? req.user.id : undefined) })
      if (!d) return res.status(404).json({ error: 'Nenhum prazo cadastrado para o período.' })
      res.json(d)
    }),
  )

  router.get(
    '/prazos/meus',
    requireRole('TEACHER', ...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = qs(req.query.professorUserId) && temPapel(req.user?.role, ...GESTAO) ? qs(req.query.professorUserId)! : getUserId(req)
      const termIds = (await prisma.classSection.findMany({ where: { tenantId, professorUserId: userId }, select: { termId: true }, distinct: ['termId'] })).map((s) => s.termId)
      const prazos = await prisma.calPrazoNotas.findMany({ where: { tenantId, termId: { in: termIds }, ativo: true }, include: { excecoes: { where: { userId } }, conclusoes: { where: { userId } } }, orderBy: { prazo: 'asc' } })
      const items = []
      for (const p of prazos) {
        if (p.programId || p.campusId) {
          const prof = await professoresDoPrazo(tenantId, p)
          if (!prof.includes(userId)) continue
        }
        const s = situacaoPrazo(p, new Date(), p.excecoes[0]?.ate ?? null)
        items.push({ id: p.id, termId: p.termId, tipo: p.tipo, etapa: p.etapa, titulo: p.titulo, prazoOriginal: p.prazo, prazo: s.efetivo, situacao: s.situacao, diasRestantes: s.diasRestantes, prorrogado: s.prorrogado, concluido: p.conclusoes.length > 0 })
      }
      res.json({ items })
    }),
  )

  router.get(
    '/prazos/:id',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const p = await prisma.calPrazoNotas.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { excecoes: temPapel(req.user?.role, ...GESTAO) } })
      if (!p) return res.status(404).json({ error: 'Prazo não encontrado.' })
      res.json({ ...p, ...situacaoPrazo(p) })
    }),
  )

  router.get(
    '/prazos/:id/pendencias',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const p = await prisma.calPrazoNotas.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Prazo não encontrado.' })
      const r = await pendentes(tenantId, p)
      const nomes = await nomesUsuarios(tenantId, r.todos)
      res.json({
        prazo: { id: p.id, titulo: p.titulo, ...situacaoPrazo(p) },
        total: r.todos.length,
        concluidos: r.concluidos.map((u) => ({ userId: u, nome: nomes.get(u) ?? null })),
        pendentes: r.pendentes.map((x) => ({ userId: x.userId, nome: nomes.get(x.userId) ?? null, prazoEfetivo: x.efetivo, vencido: x.efetivo.getTime() < Date.now() })),
      })
    }),
  )

  router.post(
    '/prazos',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const d = parseBody(prazoBase, req.body)
      await requireTerm(tenantId, d.termId)
      if (d.abertura && d.abertura.getTime() >= d.prazo.getTime()) throw erro(400, 'A abertura deve ser anterior ao prazo.')
      const row = await prisma.calPrazoNotas.create({ data: { ...d, tenantId, criadoPorId: getUserId(req) } })
      const n = await agendarLembretesPrazo(tenantId, row)
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CRIAR_PRAZO', refType: 'CalPrazoNotas', refId: row.id, detalhes: { prazo: row.prazo, lembretes: n } })
      res.status(201).json({ ...row, lembretesAgendados: n })
    }),
  )

  router.patch(
    '/prazos/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const atual = await prisma.calPrazoNotas.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!atual) return res.status(404).json({ error: 'Prazo não encontrado.' })
      const d: any = parseBody(prazoBase.partial().omit({ termId: true }), req.body)
      const row = await prisma.calPrazoNotas.update({ where: { id: atual.id }, data: { ...d, ...(d.prazo && d.prazo.getTime() !== atual.prazo.getTime() ? { escalonadoCoordEm: null, escalonadoDirecaoEm: null } : {}) } })
      await cancelReminders({ tenantId, refType: 'CalPrazoNotas', refId: row.id })
      if (row.ativo) await agendarLembretesPrazo(tenantId, row)
      else await cancelReminders({ tenantId, refType: 'CalPrazoEscalonamento', refId: row.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'ATUALIZAR_PRAZO', refType: 'CalPrazoNotas', refId: row.id, detalhes: { antes: atual.prazo, depois: row.prazo } })
      res.json(row)
    }),
  )

  router.delete(
    '/prazos/:id',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const atual = await prisma.calPrazoNotas.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!atual) return res.status(404).json({ error: 'Prazo não encontrado.' })
      await prisma.calPrazoNotas.delete({ where: { id: atual.id } })
      await cancelReminders({ tenantId, refType: 'CalPrazoNotas', refId: atual.id })
      await cancelReminders({ tenantId, refType: 'CalPrazoEscalonamento', refId: atual.id })
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'REMOVER_PRAZO', refType: 'CalPrazoNotas', refId: atual.id })
      res.status(204).end()
    }),
  )

  router.post(
    '/prazos/:id/prorrogar',
    requireRole(...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const userId = getUserId(req)
      const b = parseBody(z.object({ novoPrazo: dateISO(), motivo: z.string().min(5).max(500), professorUserId: z.string().optional() }), req.body)
      const p = await prisma.calPrazoNotas.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Prazo não encontrado.' })
      if (b.novoPrazo.getTime() <= prazoEfetivo(p).getTime() && !b.professorUserId) throw erro(409, 'O novo prazo deve ser posterior ao prazo vigente.')
      if (b.novoPrazo.getTime() <= p.prazo.getTime()) throw erro(409, 'O novo prazo deve ser posterior ao prazo original.')
      if (b.professorUserId) {
        if (!(await prisma.user.findFirst({ where: { id: b.professorUserId, tenantId }, select: { id: true } }))) throw erro(404, 'Professor não encontrado.')
        await prisma.calPrazoExcecao.upsert({ where: { prazoId_userId: { prazoId: p.id, userId: b.professorUserId } }, create: { tenantId, prazoId: p.id, userId: b.professorUserId, ate: b.novoPrazo, motivo: b.motivo, concedidoPorId: userId }, update: { ate: b.novoPrazo, motivo: b.motivo, concedidoPorId: userId } })
        await notify({ tenantId, userId: b.professorUserId, assunto: 'Prazo de lançamento prorrogado', mensagem: `Seu prazo "${p.titulo}" foi prorrogado para ${fmt(b.novoPrazo)}.`, refType: 'CalPrazoNotas', refId: p.id })
      } else {
        await prisma.calPrazoNotas.update({ where: { id: p.id }, data: { prorrogadoAte: b.novoPrazo, escalonadoCoordEm: null, escalonadoDirecaoEm: null } })
        const prof = await professoresDoPrazo(tenantId, p)
        for (const u of prof) await notify({ tenantId, userId: u, assunto: 'Prazo de lançamento prorrogado', mensagem: `O prazo "${p.titulo}" foi prorrogado para ${fmt(b.novoPrazo)}.`, refType: 'CalPrazoNotas', refId: p.id })
        await cancelReminders({ tenantId, refType: 'CalPrazoEscalonamento', refId: p.id })
      }
      const atual = await prisma.calPrazoNotas.findUniqueOrThrow({ where: { id: p.id } })
      await cancelReminders({ tenantId, refType: 'CalPrazoNotas', refId: p.id }) // chaves incluem a data efetiva: recria com o novo prazo
      const n = await agendarLembretesPrazo(tenantId, atual)
      await audit({ tenantId, userId, modulo: MODULO, acao: 'PRORROGAR_PRAZO', refType: 'CalPrazoNotas', refId: p.id, detalhes: { de: prazoEfetivo(p), para: b.novoPrazo, motivo: b.motivo, professorUserId: b.professorUserId } })
      res.json({ prazoEfetivo: b.professorUserId ? undefined : b.novoPrazo, lembretesReagendados: n })
    }),
  )

  router.post(
    '/prazos/:id/concluir',
    requireRole('TEACHER', ...GESTAO),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const b = parseBody(z.object({ professorUserId: z.string().optional() }), req.body ?? {})
      const alvo = b.professorUserId && temPapel(req.user?.role, ...GESTAO) ? b.professorUserId : getUserId(req)
      const p = await prisma.calPrazoNotas.findFirst({ where: { id: String(req.params.id), tenantId } })
      if (!p) return res.status(404).json({ error: 'Prazo não encontrado.' })
      await concluirPrazo(tenantId, p.id, alvo, 'manual')
      await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'CONCLUIR_PRAZO', refType: 'CalPrazoNotas', refId: p.id, detalhes: { professorUserId: alvo } })
      res.json({ concluido: true })
    }),
  )
}
