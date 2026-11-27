import { Router } from 'express'
import { scheduleReminder, completeReminders, cancelReminders } from '../../core/reminders'
import { registerEduJob } from '../../core/jobs'
import {
  AuthenticatedRequest, GESTAO, LEITURA, MOD2, Response, addDias, asyncHandler, audit, dateISO, exigirUsuario, fail, getTenantId, getUserId, idParam, money,
  nextNum, nomeDe, pageParams, parseBody, prisma, qs, requireRole, z,
} from './common'

export const TIPOS_AGENDA = ['PREVENTIVA', 'EVENTUAL', 'AQUISICAO', 'EXPANSAO', 'SEGURANCA', 'AVISO', 'SINALIZACAO', 'IDENTIDADE_VISUAL', 'MOBILIARIO'] as const
export const AREAS_AGENDA = ['EQUIPAMENTOS', 'TELHADO', 'BANHEIRO', 'JARDIM', 'ELETRICA', 'HIDRAULICA', 'PINTURA', 'CALCAMENTO', 'INSPECAO', 'EXTINTOR', 'CIPA', 'EPI', 'SIMULADO', 'COMUNICACAO', 'MOBILIARIO', 'OUTRO'] as const
const RECORRENTES: string[] = ['PREVENTIVA', 'SEGURANCA']
const PRIOR = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const

const create = z.object({
  tipo: z.enum(TIPOS_AGENDA), area: z.enum(AREAS_AGENDA).default('OUTRO'), titulo: z.string().min(3).max(200),
  descricao: z.string().max(4000).optional().nullable(), anotacoes: z.string().max(4000).optional().nullable(),
  departamentoId: z.string().optional().nullable(), departamentoNome: z.string().max(120).optional().nullable(),
  spaceId: z.string().optional().nullable(), local: z.string().max(200).optional().nullable(),
  responsavelUserId: z.string().optional().nullable(),
  inicio: dateISO(), fim: dateISO().optional().nullable(),
  recorrenciaDias: z.number().int().min(1).max(3650).optional().nullable(),
  prioridade: z.enum(PRIOR).default('MEDIA'), custoPrevisto: z.number().min(0).default(0),
})

const atrasado = (i: { status: string; inicio: Date; fim: Date | null }, agora = new Date()) => ['PLANEJADO', 'EM_ANDAMENTO'].includes(i.status) && (i.fim ?? i.inicio) < agora
const view = (i: any) => ({ ...i, atrasado: atrasado(i) })

async function validar(tenantId: string, d: { spaceId?: string | null; departamentoId?: string | null; responsavelUserId?: string | null; inicio?: Date; fim?: Date | null; tipo?: string; recorrenciaDias?: number | null }) {
  if (d.spaceId && !(await prisma.eduSpace.findFirst({ where: { id: d.spaceId, tenantId } }))) fail(400, 'Espaço (spaceId) não encontrado.')
  let depNome: string | undefined
  if (d.departamentoId) {
    const dep = await prisma.cppDepartamento.findFirst({ where: { id: d.departamentoId, tenantId } })
    if (!dep) fail(400, 'Departamento (departamentoId) não encontrado.')
    depNome = (dep as any).nome
  }
  const respNome = await exigirUsuario(tenantId, d.responsavelUserId)
  if (d.inicio && d.fim && d.fim < d.inicio) fail(400, 'fim anterior ao início.')
  if (d.recorrenciaDias && d.tipo && !RECORRENTES.includes(d.tipo)) fail(400, 'Recorrência só se aplica a manutenções preventivas e a itens de segurança (CIPA, extintores, simulados).')
  return { depNome, respNome }
}

async function lembrar(tenantId: string, i: any) {
  if (['CONCLUIDO', 'CANCELADO'].includes(i.status)) return
  await scheduleReminder({
    tenantId, modulo: 'infraestrutura', titulo: `Agenda de infraestrutura: ${i.titulo}`, dueAt: i.fim ?? i.inicio, antecedenciaDias: 2,
    refType: 'Inf2AgendaItem', refId: i.id, assigneeUserId: i.responsavelUserId ?? undefined, assigneeRole: i.responsavelUserId ? undefined : 'FACILITIES',
    severity: i.prioridade === 'URGENTE' ? 'CRITICO' : 'INFO', dedupeKey: `inf2-agenda-${i.id}`,
  })
}

export function mountAgenda(router: Router) {
  // Pessoas do tenant para escolher responsáveis (id e nome apenas; sem e-mail/telefone/CPF — minimização LGPD).
  router.get('/pessoas', requireRole(...GESTAO, 'COORDINATOR', 'HR' as any), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const q = qs(req.query.q)
    const us = await prisma.user.findMany({
      where: { tenantId, role: { not: 'STUDENT' as any }, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, firstName: true, lastName: true, role: true }, orderBy: { firstName: 'asc' }, take: 300,
    })
    res.json({ items: us.map((u) => ({ id: u.id, nome: [u.firstName, u.lastName].filter(Boolean).join(' '), perfil: u.role })), total: us.length })
  }))
  router.get('/agenda/catalogo', requireRole(...LEITURA), (_req, res) => res.json({ tipos: TIPOS_AGENDA, areas: AREAS_AGENDA, prioridades: PRIOR, status: ['PLANEJADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'] }))

  router.post('/agenda/itens', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(create, req.body)
    const { depNome, respNome } = await validar(tenantId, d)
    const codigo = await nextNum(tenantId, 'AGE', 'AGE')
    const item = await prisma.inf2AgendaItem.create({
      data: { ...d, tenantId, codigo, departamentoNome: depNome ?? d.departamentoNome ?? null, responsavelNome: respNome, criadoPorId: getUserId(req) },
    })
    await lembrar(tenantId, item)
    await audit({ tenantId, userId: getUserId(req), modulo: MOD2, acao: 'AGENDA_CRIADA', refType: 'Inf2AgendaItem', refId: item.id })
    res.status(201).json(view(item))
  }))

  router.get('/agenda/itens', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    for (const f of ['tipo', 'area', 'status', 'responsavelUserId', 'departamentoId', 'spaceId', 'prioridade']) { const v = qs((req.query as any)[f]); if (v) where[f] = v }
    const de = qs(req.query.de), ate = qs(req.query.ate)
    if (de || ate) where.inicio = { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate + (ate.length <= 10 ? 'T23:59:59Z' : '')) } : {}) }
    if (qs(req.query.atrasados) === 'true') { where.status = { in: ['PLANEJADO', 'EM_ANDAMENTO'] }; where.OR = [{ fim: { lt: new Date() } }, { fim: null, inicio: { lt: new Date() } }] }
    const q = qs(req.query.q)
    if (q) where.AND = [{ OR: [{ titulo: { contains: q, mode: 'insensitive' } }, { descricao: { contains: q, mode: 'insensitive' } }, { anotacoes: { contains: q, mode: 'insensitive' } }] }]
    const [rows, total] = await Promise.all([prisma.inf2AgendaItem.findMany({ where, orderBy: { inicio: 'asc' }, skip, take }), prisma.inf2AgendaItem.count({ where })])
    res.json({ items: rows.map(view), total, page, pageSize })
  }))

  router.get('/agenda/resumo', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const agora = new Date()
    const todos = await prisma.inf2AgendaItem.findMany({ where: { tenantId, status: { not: 'CANCELADO' } } })
    const abertos = todos.filter((i) => ['PLANEJADO', 'EM_ANDAMENTO'].includes(i.status))
    const por = (k: 'tipo' | 'area' | 'status') => todos.reduce<Record<string, number>>((m, i) => { m[i[k]] = (m[i[k]] ?? 0) + 1; return m }, {})
    res.json({
      total: todos.length, porTipo: por('tipo'), porArea: por('area'), porStatus: por('status'),
      atrasados: abertos.filter((i) => atrasado(i, agora)).map((i) => ({ id: i.id, codigo: i.codigo, titulo: i.titulo, tipo: i.tipo, responsavelNome: i.responsavelNome })),
      proximos30Dias: abertos.filter((i) => i.inicio >= agora && i.inicio <= addDias(agora, 30)).length,
      preventivasRecorrentes: abertos.filter((i) => i.tipo === 'PREVENTIVA' && i.recorrenciaDias).length,
      custoPrevisto: money(abertos.reduce((s, i) => s + i.custoPrevisto, 0)),
      custoRealizado: money(todos.reduce((s, i) => s + (i.custoReal ?? 0), 0)),
    })
  }))

  router.get('/agenda/itens/:id', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const i = await prisma.inf2AgendaItem.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) }, include: { notas: { orderBy: { createdAt: 'asc' } } } })
    if (!i) return res.status(404).json({ error: 'Item da agenda não encontrado.' })
    res.json(view(i))
  }))

  router.patch('/agenda/itens/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.inf2AgendaItem.findFirst({ where: { id: idParam(req), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Item da agenda não encontrado.' })
    if (['CONCLUIDO', 'CANCELADO'].includes(cur.status)) fail(409, 'Item encerrado não pode ser alterado.')
    const d = parseBody(create.partial().extend({ prioridade: z.enum(PRIOR).optional(), area: z.enum(AREAS_AGENDA).optional(), custoPrevisto: z.number().min(0).optional() }), req.body)
    const { depNome, respNome } = await validar(tenantId, { ...d, tipo: d.tipo ?? cur.tipo, inicio: d.inicio ?? cur.inicio, fim: d.fim === undefined ? cur.fim : d.fim })
    const data: any = { ...d }
    if (d.departamentoId) data.departamentoNome = depNome
    if (d.responsavelUserId) data.responsavelNome = respNome
    if (d.responsavelUserId === null) data.responsavelNome = null
    const item = await prisma.inf2AgendaItem.update({ where: { id: cur.id }, data })
    await lembrar(tenantId, item)
    res.json(view(item))
  }))

  router.post('/agenda/itens/:id/notas', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const i = await prisma.inf2AgendaItem.findFirst({ where: { id: idParam(req), tenantId } })
    if (!i) return res.status(404).json({ error: 'Item da agenda não encontrado.' })
    const b = parseBody(z.object({ texto: z.string().min(1).max(4000) }), req.body)
    const n = await prisma.inf2AgendaNota.create({ data: { tenantId, itemId: i.id, userId: getUserId(req), autorNome: await nomeDe(req), texto: b.texto } })
    res.status(201).json(n)
  }))

  const transicao = (acao: 'iniciar' | 'concluir' | 'cancelar') =>
    router.post(`/agenda/itens/:id/${acao}`, requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const tenantId = getTenantId(req)
      const cur = await prisma.inf2AgendaItem.findFirst({ where: { id: idParam(req), tenantId } })
      if (!cur) return res.status(404).json({ error: 'Item da agenda não encontrado.' })
      const b = parseBody(z.object({ custoReal: z.number().min(0).optional(), nota: z.string().max(4000).optional(), motivo: z.string().max(500).optional() }), req.body ?? {})
      if (acao === 'iniciar') {
        if (cur.status !== 'PLANEJADO') fail(409, 'Só itens planejados podem ser iniciados.')
        return res.json(view(await prisma.inf2AgendaItem.update({ where: { id: cur.id }, data: { status: 'EM_ANDAMENTO' } })))
      }
      if (['CONCLUIDO', 'CANCELADO'].includes(cur.status)) fail(409, 'Item já encerrado.')
      if (acao === 'cancelar') {
        const i = await prisma.inf2AgendaItem.update({ where: { id: cur.id }, data: { status: 'CANCELADO', anotacoes: [cur.anotacoes, b.motivo ? `Cancelado: ${b.motivo}` : null].filter(Boolean).join('\n') || null } })
        await cancelReminders({ tenantId, refType: 'Inf2AgendaItem', refId: cur.id })
        return res.json(view(i))
      }
      const agora = new Date()
      let proximaId: string | undefined
      if (RECORRENTES.includes(cur.tipo) && cur.recorrenciaDias) {
        const dur = cur.fim ? cur.fim.getTime() - cur.inicio.getTime() : 0
        const base = cur.fim ?? cur.inicio
        const novoInicio = addDias(base > agora ? base : agora, cur.recorrenciaDias)
        const prox = await prisma.inf2AgendaItem.create({
          data: {
            tenantId, codigo: await nextNum(tenantId, 'AGE', 'AGE'), tipo: cur.tipo, area: cur.area, titulo: cur.titulo, descricao: cur.descricao, anotacoes: cur.anotacoes,
            departamentoId: cur.departamentoId, departamentoNome: cur.departamentoNome, spaceId: cur.spaceId, local: cur.local, responsavelUserId: cur.responsavelUserId,
            responsavelNome: cur.responsavelNome, inicio: novoInicio, fim: dur ? new Date(novoInicio.getTime() + dur) : null, recorrenciaDias: cur.recorrenciaDias,
            prioridade: cur.prioridade, custoPrevisto: cur.custoPrevisto, origemId: cur.origemId ?? cur.id, criadoPorId: getUserId(req),
          },
        })
        proximaId = prox.id
        await lembrar(tenantId, prox)
      }
      const i = await prisma.inf2AgendaItem.update({ where: { id: cur.id }, data: { status: 'CONCLUIDO', concluidoEm: agora, concluidoPorId: getUserId(req), custoReal: b.custoReal ?? cur.custoReal, proximaId } })
      if (b.nota) await prisma.inf2AgendaNota.create({ data: { tenantId, itemId: cur.id, userId: getUserId(req), autorNome: await nomeDe(req), texto: b.nota } })
      await completeReminders({ tenantId, refType: 'Inf2AgendaItem', refId: cur.id, userId: getUserId(req) })
      await audit({ tenantId, userId: getUserId(req), modulo: MOD2, acao: 'AGENDA_CONCLUIDA', refType: 'Inf2AgendaItem', refId: cur.id })
      res.json({ ...view(i), proxima: proximaId ? view(await prisma.inf2AgendaItem.findUnique({ where: { id: proximaId } })) : null })
    }))
  transicao('iniciar'); transicao('concluir'); transicao('cancelar')

  router.delete('/agenda/itens/:id', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const cur = await prisma.inf2AgendaItem.findFirst({ where: { id: idParam(req), tenantId } })
    if (!cur) return res.status(404).json({ error: 'Item da agenda não encontrado.' })
    if (cur.status !== 'PLANEJADO') fail(409, 'Só é possível excluir itens planejados; cancele os demais.')
    await prisma.inf2AgendaItem.delete({ where: { id: cur.id } })
    await cancelReminders({ tenantId, refType: 'Inf2AgendaItem', refId: cur.id })
    res.status(204).end()
  }))
}

/** Job: reforça lembretes de itens abertos e avisa o responsável sobre atrasos. */
export async function jobAgenda() {
  const abertos = await prisma.inf2AgendaItem.findMany({ where: { status: { in: ['PLANEJADO', 'EM_ANDAMENTO'] } }, take: 2000 })
  let n = 0
  for (const i of abertos) { await lembrar(i.tenantId, i); if (atrasado(i)) n++ }
  return { abertos: abertos.length, atrasados: n }
}
export function registerAgendaJob() { registerEduJob('infra2.agenda', () => jobAgenda()) }
