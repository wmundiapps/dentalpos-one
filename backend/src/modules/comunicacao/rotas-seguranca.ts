import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { scheduleReminder } from '../core/reminders'
import { ATENDE, APROVA_SIGILO, GESTAO_COM } from './roles'
import { podeVerConversa, registrarAcessoLog } from './seguranca'

const router = Router()

async function conversaOu404(req: AuthenticatedRequest, res: Response, id: string) {
  const c = await prisma.comConversa.findFirst({ where: { id, tenantId: getTenantId(req) }, include: { contato: true } })
  if (!c) { res.status(404).json({ error: 'Conversa não encontrada.' }); return null }
  return c
}

// ---------------------------------------------------------------- sigilo (marcar/desmarcar)
router.post(
  '/conversas/:id/sigilo',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res, String(req.params.id))
    if (!c) return
    const { sigilosa } = parseBody(z.object({ sigilosa: z.boolean() }), req.body)
    const r = await prisma.comConversa.update({ where: { id: c.id }, data: { sigilosa } })
    const userId = getUserId(req)
    await registrarAcessoLog({ tenantId: c.tenantId, conversaId: c.id, userId, acao: sigilosa ? 'MARCOU_SIGILOSA' : 'REMOVEU_SIGILO', req })
    await audit({ tenantId: c.tenantId, userId, modulo: 'comunicacao', acao: sigilosa ? 'CONVERSA_SIGILO_MARCADA' : 'CONVERSA_SIGILO_REMOVIDA', refType: 'ComConversa', refId: c.id })
    res.json(r)
  }),
)

// ---------------------------------------------------------------- departamento (roteamento manual)
router.post(
  '/conversas/:id/departamento',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res, String(req.params.id))
    if (!c) return
    const { departamento } = parseBody(z.object({ departamento: z.string().min(1).max(80).nullable() }), req.body)
    res.json(await prisma.comConversa.update({ where: { id: c.id }, data: { departamento } }))
  }),
)

// ---------------------------------------------------------------- histórico (assuntos relacionados ao mesmo contato)
router.get(
  '/conversas/:id/historico',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res, String(req.params.id))
    if (!c) return
    if (!(await podeVerConversa(req, c))) return res.status(403).json({ error: 'Conversa sigilosa: sem acesso. Solicite liberação ao Jurídico ou à Reitoria.' })
    const outras = await prisma.comConversa.findMany({
      where: { tenantId: c.tenantId, contatoId: c.contatoId, id: { not: c.id }, sigilosa: false },
      select: { id: true, assunto: true, status: true, departamento: true, canalTipo: true, createdAt: true, ultimaMensagemEm: true },
      orderBy: { ultimaMensagemEm: 'desc' },
      take: 20,
    })
    res.json({ items: outras })
  }),
)

// ---------------------------------------------------------------- pedido de acesso
const solicitarSchema = z.object({ motivo: z.string().min(3).max(500) })
router.post(
  '/conversas/:id/acesso/solicitar',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res, String(req.params.id))
    if (!c) return
    if (!c.sigilosa) return res.status(409).json({ error: 'Esta conversa não está marcada como sigilosa.' })
    const { motivo } = parseBody(solicitarSchema, req.body)
    const userId = getUserId(req)
    const pendente = await prisma.comAcessoSolicitacao.findFirst({ where: { tenantId: c.tenantId, conversaId: c.id, solicitanteId: userId, status: 'PENDENTE' } })
    if (pendente) return res.status(409).json({ error: 'Você já tem um pedido de acesso pendente para esta conversa.' })
    const s = await prisma.comAcessoSolicitacao.create({ data: { tenantId: c.tenantId, conversaId: c.id, solicitanteId: userId, motivo } })
    await registrarAcessoLog({ tenantId: c.tenantId, conversaId: c.id, userId, acao: 'SOLICITOU', req, detalhes: motivo })
    await scheduleReminder({
      tenantId: c.tenantId, modulo: 'comunicacao', titulo: `Pedido de acesso a conversa sigilosa: ${c.contato.nome}`,
      dueAt: new Date(Date.now() + 24 * 3600_000), remindAt: new Date(), refType: 'ComAcessoSolicitacao', refId: s.id,
      assigneeRole: 'LEGAL', severity: 'ATENCAO', dedupeKey: `com-acesso-${s.id}`,
    })
    res.status(201).json(s)
  }),
)

router.get(
  '/acesso/solicitacoes',
  requireRole(...APROVA_SIGILO),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const status = qs(req.query.status) || 'PENDENTE'
    const where: any = { tenantId, ...(status === 'TODAS' ? {} : { status }) }
    const [items, total] = await Promise.all([
      prisma.comAcessoSolicitacao.findMany({ where, include: { conversa: { select: { id: true, assunto: true, canalTipo: true, departamento: true, contato: { select: { nome: true } } } } }, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.comAcessoSolicitacao.count({ where }),
    ])
    const solicitantes = await prisma.user.findMany({ where: { id: { in: items.map((i) => i.solicitanteId) } }, select: { id: true, firstName: true, lastName: true } })
    const nomes = new Map(solicitantes.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]))
    res.json({ items: items.map((i) => ({ ...i, solicitanteNome: nomes.get(i.solicitanteId) || 'Usuário' })), total, page, pageSize })
  }),
)

const decidirSchema = z.object({ aprovar: z.boolean(), motivo: z.string().max(500).optional() })
router.post(
  '/acesso/solicitacoes/:id/decidir',
  requireRole(...APROVA_SIGILO),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const s = await prisma.comAcessoSolicitacao.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!s) return res.status(404).json({ error: 'Pedido não encontrado.' })
    if (s.status !== 'PENDENTE') return res.status(409).json({ error: 'Este pedido já foi decidido.' })
    const { aprovar, motivo } = parseBody(decidirSchema, req.body)
    const decisorId = getUserId(req)
    const r = await prisma.comAcessoSolicitacao.update({ where: { id: s.id }, data: { status: aprovar ? 'APROVADO' : 'NEGADO', decisorId, decididoEm: new Date(), motivoDecisao: motivo } })
    await registrarAcessoLog({ tenantId, conversaId: s.conversaId, userId: decisorId, acao: aprovar ? 'APROVOU' : 'NEGOU', req, detalhes: motivo })
    await audit({ tenantId, userId: decisorId, modulo: 'comunicacao', acao: aprovar ? 'ACESSO_SIGILO_APROVADO' : 'ACESSO_SIGILO_NEGADO', refType: 'ComAcessoSolicitacao', refId: s.id })
    res.json(r)
  }),
)

// ---------------------------------------------------------------- log de acesso (auditoria) de uma conversa
router.get(
  '/conversas/:id/acesso',
  requireRole(...APROVA_SIGILO, ...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res, String(req.params.id))
    if (!c) return
    const [solicitacoes, log] = await Promise.all([
      prisma.comAcessoSolicitacao.findMany({ where: { tenantId: c.tenantId, conversaId: c.id }, orderBy: { createdAt: 'desc' } }),
      prisma.comAcessoLog.findMany({ where: { tenantId: c.tenantId, conversaId: c.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    ])
    const userIds = Array.from(new Set([...solicitacoes.flatMap((s) => [s.solicitanteId, s.decisorId].filter(Boolean) as string[]), ...log.map((l) => l.userId)]))
    const usuarios = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    const nomes = new Map(usuarios.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]))
    res.json({
      solicitacoes: solicitacoes.map((s) => ({ ...s, solicitanteNome: nomes.get(s.solicitanteId), decisorNome: s.decisorId ? nomes.get(s.decisorId) : null })),
      log: log.map((l) => ({ ...l, userNome: nomes.get(l.userId) })),
    })
  }),
)

export default router
