import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { pageParams, parseBody, qs } from '../core/crud'
import { audit } from '../core/notify'
import { sendVia } from './adapters'
import { ATENDE, GESTAO_COM } from './roles'
import { canalAtivo, getConfig, lerCfg, webhookUrl } from './store'
import { normalizePhone, twimlDizer, twimlUra, UraMenu } from './pure'

const router = Router()

export const URA_PADRAO: UraMenu = {
  saudacao: 'Olá! Você ligou para a nossa instituição de ensino.',
  opcoes: [
    { digito: '1', rotulo: 'secretaria acadêmica', acao: 'ATENDENTE' },
    { digito: '2', rotulo: 'financeiro', acao: 'ATENDENTE' },
    { digito: '3', rotulo: 'informações sobre matrículas', acao: 'MENSAGEM', mensagem: 'As matrículas podem ser feitas em nosso site ou na secretaria, de segunda a sábado, em horário comercial.' },
  ],
}

const uraSchema = z.object({ saudacao: z.string().min(3), opcoes: z.array(z.object({ digito: z.string().regex(/^[0-9*#]$/), rotulo: z.string().min(2), acao: z.enum(['ENCAMINHAR', 'MENSAGEM', 'ATENDENTE']), destino: z.string().optional(), mensagem: z.string().optional() }).refine((o) => (o.acao === 'ENCAMINHAR' ? !!normalizePhone(o.destino) : o.acao === 'MENSAGEM' ? !!o.mensagem : true), 'ENCAMINHAR exige destino (telefone) e MENSAGEM exige mensagem')).min(1).max(9) })

router.get(
  '/voz/ura',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const cfg = await getConfig(getTenantId(req))
    const menu = (cfg.uraMenu as unknown as UraMenu) ?? URA_PADRAO
    res.json({ menu, personalizada: !!cfg.uraMenu, twimlPreview: twimlUra(menu, '/voz/<canal>/digito') })
  }),
)
router.put(
  '/voz/ura',
  requireRole(...GESTAO_COM),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(uraSchema, req.body)
    if (new Set(b.opcoes.map((o) => o.digito)).size !== b.opcoes.length) return res.status(400).json({ error: 'Dígitos repetidos na URA.' })
    await getConfig(tenantId)
    await prisma.comConfig.update({ where: { tenantId }, data: { uraMenu: b as any } })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'URA_ATUALIZADA' })
    res.json(b)
  }),
)

const ligarSchema = z.object({ para: z.string().optional(), contatoId: z.string().optional(), mensagem: z.string().min(3).max(1000) })
router.post(
  '/voz/chamadas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(ligarSchema, req.body)
    let para = b.para
    if (b.contatoId) {
      const c = await prisma.comContato.findFirst({ where: { id: b.contatoId, tenantId } })
      if (!c) return res.status(404).json({ error: 'Contato não encontrado.' })
      para = para ?? c.telefone ?? undefined
    }
    const tel = normalizePhone(para)
    if (!tel) return res.status(400).json({ error: 'Telefone de destino inválido.' })
    const canal = await canalAtivo(tenantId, 'VOZ')
    const log = await prisma.comChamada.create({ data: { tenantId, canalId: canal?.id, direcao: 'SAIDA', para: tel, contatoId: b.contatoId, mensagem: b.mensagem, atendenteId: getUserId(req) } })
    if (!canal) {
      const r = await prisma.comChamada.update({ where: { id: log.id }, data: { status: 'FALHA', erro: 'Canal de voz não configurado (Twilio). Ligação NÃO realizada.', fimEm: new Date() } })
      return res.status(409).json(r)
    }
    const { cfg, erro } = lerCfg(canal)
    if (!cfg) {
      const r = await prisma.comChamada.update({ where: { id: log.id }, data: { status: 'FALHA', erro: erro ?? 'Credenciais ausentes.', fimEm: new Date() } })
      return res.status(409).json(r)
    }
    const r = await sendVia('VOZ', canal.provedor, cfg, { destino: tel, mensagem: b.mensagem, twiml: twimlDizer(b.mensagem).replace('<?xml version="1.0" encoding="UTF-8"?>', ''), statusCallback: webhookUrl(canal.id, '/voz/status') })
    const upd = await prisma.comChamada.update({ where: { id: log.id }, data: r.ok ? { provedorSid: r.provedorId, status: 'TOCANDO' } : { status: 'FALHA', erro: r.erro, fimEm: new Date() } })
    res.status(r.ok ? 201 : 502).json(upd)
  }),
)

router.get(
  '/voz/chamadas',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const { skip, take, page, pageSize } = pageParams(req.query)
    const where: any = { tenantId }
    if (qs(req.query.status)) where.status = qs(req.query.status)
    if (qs(req.query.direcao)) where.direcao = qs(req.query.direcao)
    if (qs(req.query.contatoId)) where.contatoId = qs(req.query.contatoId)
    const [items, total] = await Promise.all([prisma.comChamada.findMany({ where, orderBy: { inicioEm: 'desc' }, skip, take }), prisma.comChamada.count({ where })])
    res.json({ items, total, page, pageSize })
  }),
)
router.patch(
  '/voz/chamadas/:id',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ notas: z.string().max(4000).optional(), contatoId: z.string().optional() }), req.body)
    const r = await prisma.comChamada.updateMany({ where: { id: String(req.params.id), tenantId }, data: b })
    if (!r.count) return res.status(404).json({ error: 'Chamada não encontrada.' })
    res.json(await prisma.comChamada.findFirst({ where: { id: String(req.params.id), tenantId } }))
  }),
)
// Registro manual de ligação (atendimento por telefone convencional).
router.post(
  '/voz/chamadas/registrar',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const b = parseBody(z.object({ direcao: z.enum(['SAIDA', 'ENTRADA']), numero: z.string(), contatoId: z.string().optional(), duracaoSeg: z.number().int().min(0).optional(), notas: z.string().optional(), status: z.enum(['CONCLUIDA', 'NAO_ATENDIDA', 'OCUPADO']).default('CONCLUIDA') }), req.body)
    const tel = normalizePhone(b.numero) ?? b.numero
    res.status(201).json(await prisma.comChamada.create({ data: { tenantId, direcao: b.direcao, de: b.direcao === 'ENTRADA' ? tel : undefined, para: b.direcao === 'SAIDA' ? tel : undefined, contatoId: b.contatoId, duracaoSeg: b.duracaoSeg, notas: b.notas, status: b.status, atendenteId: getUserId(req), fimEm: new Date() } }))
  }),
)

export default router
