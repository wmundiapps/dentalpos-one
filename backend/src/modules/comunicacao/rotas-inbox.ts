import { Prisma } from '@prisma/client'
import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { completeReminders, scheduleReminder } from '../core/reminders'
import { enviarNaConversa, registrarPrimeiraResposta } from './inbox'
import { ATENDE } from './roles'
import { calcularSla, statusSla } from './pure'
import { getConfig } from './store'

const router = Router()
const STATUS = ['ABERTA', 'PENDENTE', 'EM_ATENDIMENTO', 'AGUARDANDO_CONTATO', 'RESOLVIDA', 'ARQUIVADA'] as const

async function conversaOu404(req: AuthenticatedRequest, res: Response) {
  const c = await prisma.comConversa.findFirst({ where: { id: String(req.params.id), tenantId: getTenantId(req) }, include: { contato: true } })
  if (!c) res.status(404).json({ error: 'Conversa não encontrada.' })
  return c
}

router.get(
  '/conversas/metricas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const agora = new Date()
    const abertas = await prisma.comConversa.findMany({ where: { tenantId, status: { notIn: ['RESOLVIDA', 'ARQUIVADA'] } }, select: { id: true, status: true, atribuidoAId: true, slaPrimeiraRespostaEm: true, primeiraRespostaEm: true, slaResolucaoEm: true, canalTipo: true }, take: 5000 })
    const sla = { OK: 0, ATENCAO: 0, ESTOURADO: 0, ENCERRADA: 0 }
    const porAtendente: Record<string, number> = {}
    const porCanal: Record<string, number> = {}
    for (const c of abertas) {
      sla[statusSla(c, agora)]++
      porAtendente[c.atribuidoAId ?? 'sem_atendente'] = (porAtendente[c.atribuidoAId ?? 'sem_atendente'] ?? 0) + 1
      porCanal[c.canalTipo] = (porCanal[c.canalTipo] ?? 0) + 1
    }
    const recentes = await prisma.comConversa.findMany({ where: { tenantId, primeiraRespostaEm: { not: null }, createdAt: { gte: new Date(agora.getTime() - 30 * 86_400_000) } }, select: { createdAt: true, primeiraRespostaEm: true }, take: 5000 })
    const tmpr = recentes.length ? Math.round(recentes.reduce((s, c) => s + (c.primeiraRespostaEm!.getTime() - c.createdAt.getTime()), 0) / recentes.length / 60000) : null
    res.json({ abertas: abertas.length, naFila: abertas.filter((c) => !c.atribuidoAId).length, sla, porAtendente, porCanal, tempoMedioPrimeiraRespostaMin: tmpr })
  }),
)

router.get(
  '/conversas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    const status = qs(req.query.status)
    if (status) where.status = status
    else if (qs(req.query.encerradas) !== 'true') where.status = { notIn: ['RESOLVIDA', 'ARQUIVADA'] }
    const atr = qs(req.query.atribuido)
    if (atr === 'me') where.atribuidoAId = getUserId(req)
    else if (atr === 'none') where.atribuidoAId = null
    else if (atr) where.atribuidoAId = atr
    if (qs(req.query.canal)) where.canalTipo = qs(req.query.canal)
    if (qs(req.query.etiqueta)) where.etiquetas = { has: qs(req.query.etiqueta) }
    const q = qs(req.query.q)
    if (q) where.OR = [{ assunto: { contains: q, mode: 'insensitive' } }, { contato: { nome: { contains: q, mode: 'insensitive' } } }, { contato: { telefone: { contains: q } } }]
    const [rows, total] = await Promise.all([prisma.comConversa.findMany({ where, include: { contato: { select: { id: true, nome: true, tipo: true, studentId: true } } }, orderBy: { ultimaMensagemEm: 'desc' }, skip, take }), prisma.comConversa.count({ where })])
    const agora = new Date()
    res.json({ items: rows.map((c) => ({ ...c, sla: statusSla(c, agora) })), total, page, pageSize })
  }),
)

const iniciarSchema = z.object({ contatoId: z.string(), canal: z.enum(['WHATSAPP', 'TELEGRAM', 'EMAIL', 'SMS']), texto: z.string().min(1), assunto: z.string().optional() })
router.post(
  '/conversas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(iniciarSchema, req.body)
    const contato = await prisma.comContato.findFirst({ where: { id: b.contatoId, tenantId } })
    if (!contato) return res.status(404).json({ error: 'Contato não encontrado.' })
    const chave = b.canal === 'EMAIL' ? contato.email : b.canal === 'TELEGRAM' ? contato.telegramChatId : contato.telefone
    if (!chave) return res.status(400).json({ error: `Contato sem ${b.canal === 'EMAIL' ? 'e-mail' : b.canal === 'TELEGRAM' ? 'chat do Telegram' : 'telefone'} cadastrado.` })
    const conv = await prisma.comConversa.create({ data: { tenantId, contatoId: contato.id, canalTipo: b.canal, chaveExterna: chave, assunto: b.assunto, status: 'AGUARDANDO_CONTATO', atribuidoAId: getUserId(req), botAtivo: false, primeiraRespostaEm: new Date() } })
    const m = await enviarNaConversa({ tenantId, conversa: conv, contato, texto: b.texto, autorTipo: 'ATENDENTE', autorId: getUserId(req) })
    res.status(201).json({ conversa: conv, mensagem: m })
  }),
)

router.get(
  '/conversas/:id',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res)
    if (!c) return
    const mensagens = await prisma.comMensagem.findMany({ where: { tenantId: c.tenantId, conversaId: c.id }, orderBy: { createdAt: 'asc' }, take: 500 })
    res.json({ ...c, sla: statusSla(c, new Date()), mensagens })
  }),
)

router.post(
  '/conversas/:id/lida',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res)
    if (!c) return
    await prisma.comConversa.update({ where: { id: c.id }, data: { naoLidas: 0 } })
    res.json({ ok: true })
  }),
)

const msgSchema = z.object({ texto: z.string().min(1).max(4000), nota: z.boolean().optional() })
router.post(
  '/conversas/:id/mensagens',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res)
    if (!c) return
    const b = parseBody(msgSchema, req.body)
    const userId = getUserId(req)
    if (b.nota) {
      const n = await prisma.comMensagem.create({ data: { tenantId: c.tenantId, conversaId: c.id, direcao: 'NOTA_INTERNA', autorTipo: 'ATENDENTE', autorId: userId, conteudo: b.texto } })
      return res.status(201).json(n)
    }
    if (['RESOLVIDA', 'ARQUIVADA'].includes(c.status)) return res.status(409).json({ error: 'Conversa encerrada: reabra antes de responder.' })
    const m = await enviarNaConversa({ tenantId: c.tenantId, conversa: c, contato: c.contato, texto: b.texto, autorTipo: 'ATENDENTE', autorId: userId })
    await prisma.comConversa.update({ where: { id: c.id }, data: { botAtivo: false, botEstado: Prisma.DbNull, atribuidoAId: c.atribuidoAId ?? userId, status: 'AGUARDANDO_CONTATO', naoLidas: 0, ultimaMensagemEm: new Date(), ultimaDirecao: 'SAIDA' } })
    await registrarPrimeiraResposta(c.tenantId, c.id)
    res.status(201).json(m)
  }),
)

router.post(
  '/conversas/:id/assumir',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res)
    if (!c) return
    res.json(await prisma.comConversa.update({ where: { id: c.id }, data: { atribuidoAId: getUserId(req), botAtivo: false, status: c.status === 'ABERTA' || c.status === 'PENDENTE' ? 'EM_ATENDIMENTO' : c.status } }))
  }),
)

router.post(
  '/conversas/:id/atribuir',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await conversaOu404(req, res)
    if (!c) return
    const { userId } = parseBody(z.object({ userId: z.string().nullable() }), req.body)
    if (userId) {
      const u = await prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true }, select: { id: true } })
      if (!u) return res.status(404).json({ error: 'Usuário não encontrado neste tenant.' })
    }
    const r = await prisma.comConversa.update({ where: { id: c.id }, data: { atribuidoAId: userId, ...(userId ? { botAtivo: false, status: c.status === 'ABERTA' || c.status === 'PENDENTE' ? 'EM_ATENDIMENTO' : c.status } : {}) } })
    if (userId) await scheduleReminder({ tenantId, modulo: 'comunicacao', titulo: `Conversa atribuída: ${c.contato.nome}`, dueAt: c.slaPrimeiraRespostaEm ?? new Date(Date.now() + 3600_000), remindAt: new Date(), refType: 'ComConversa', refId: c.id, assigneeUserId: userId, severity: 'INFO', dedupeKey: `com-atrib-${c.id}-${userId}` })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'CONVERSA_ATRIBUIDA', refType: 'ComConversa', refId: c.id, detalhes: { para: userId } })
    res.json(r)
  }),
)

router.post(
  '/conversas/:id/status',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const c = await conversaOu404(req, res)
    if (!c) return
    const { status } = parseBody(z.object({ status: z.enum(STATUS) }), req.body)
    const data: any = { status }
    if (status === 'RESOLVIDA' || status === 'ARQUIVADA') {
      data.resolvidaEm = new Date()
      data.naoLidas = 0
      await completeReminders({ tenantId, refType: 'ComConversa', refId: c.id, userId: getUserId(req) })
    }
    if (c.status === 'RESOLVIDA' && !['RESOLVIDA', 'ARQUIVADA'].includes(status)) {
      // reabertura: novo SLA
      const sla = calcularSla(new Date(), await getConfig(tenantId))
      Object.assign(data, { resolvidaEm: null, slaResolucaoEm: sla.resolucaoEm })
    }
    const r = await prisma.comConversa.update({ where: { id: c.id }, data })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: `CONVERSA_${status}`, refType: 'ComConversa', refId: c.id })
    res.json(r)
  }),
)

router.post(
  '/conversas/:id/etiquetas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res)
    if (!c) return
    const b = parseBody(z.object({ adicionar: z.array(z.string().min(1).max(40)).optional(), remover: z.array(z.string()).optional() }), req.body)
    const set = new Set(c.etiquetas)
    for (const e of b.adicionar ?? []) set.add(e.toLowerCase())
    for (const e of b.remover ?? []) set.delete(e.toLowerCase())
    res.json(await prisma.comConversa.update({ where: { id: c.id }, data: { etiquetas: [...set] } }))
  }),
)

router.patch(
  '/conversas/:id',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res)
    if (!c) return
    const b = parseBody(z.object({ assunto: z.string().max(200).optional(), prioridade: z.number().int().min(0).max(3).optional(), botAtivo: z.boolean().optional() }), req.body)
    res.json(await prisma.comConversa.update({ where: { id: c.id }, data: b }))
  }),
)

export default router
