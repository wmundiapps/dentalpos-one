import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody } from '../core/crud'
import { audit } from '../core/notify'
import { ATENDE } from './roles'
import { podeVerConversa } from './seguranca'

const router = Router()
// Só canais com conversa de voz/áudio fazem sentido gravar.
const GRAVAVEIS = ['WHATSAPP', 'TELEGRAM', 'VOZ'] as const

function avisoPadrao(canalTipo: string) {
  return canalTipo === 'VOZ'
    ? 'Esta chamada será gravada para fins de qualidade e segurança. Ao continuar, você concorda com a gravação.'
    : 'Esta conversa poderá ter trechos de voz gravados e arquivados para fins de qualidade e segurança.'
}

async function conversaOu404(req: AuthenticatedRequest, res: Response, id: string) {
  const c = await prisma.comConversa.findFirst({ where: { id, tenantId: getTenantId(req) } })
  if (!c) { res.status(404).json({ error: 'Conversa não encontrada.' }); return null }
  return c
}

// Inicia a gravação: o aviso automático é dado e registrado ANTES de qualquer gravação começar — nunca grava sem avisar.
router.post(
  '/conversas/:id/gravacoes/iniciar',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res, String(req.params.id))
    if (!c) return
    if (!(await podeVerConversa(req, c as any))) return res.status(403).json({ error: 'Conversa sigilosa: sem acesso.' })
    if (!GRAVAVEIS.includes(c.canalTipo as any)) return res.status(400).json({ error: `Gravação não se aplica ao canal ${c.canalTipo}.` })
    const aviso = avisoPadrao(c.canalTipo)
    const g = await prisma.comGravacao.create({
      data: { tenantId: c.tenantId, conversaId: c.id, canalTipo: c.canalTipo, avisoTexto: aviso, criadoPorId: getUserId(req), status: 'GRAVANDO' },
    })
    await audit({ tenantId: c.tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: 'GRAVACAO_INICIADA', refType: 'ComGravacao', refId: g.id })
    res.status(201).json(g)
  }),
)

const finalizarSchema = z.object({ arquivoUrl: z.string().min(1).optional(), duracaoSeg: z.number().int().min(0).optional(), transcricao: z.string().optional(), cancelar: z.boolean().optional() })
router.post(
  '/conversas/:id/gravacoes/:gravacaoId/finalizar',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const g = await prisma.comGravacao.findFirst({ where: { id: String(req.params.gravacaoId), conversaId: String(req.params.id), tenantId } })
    if (!g) return res.status(404).json({ error: 'Gravação não encontrada.' })
    const b = parseBody(finalizarSchema, req.body)
    const r = await prisma.comGravacao.update({
      where: { id: g.id },
      data: { status: b.cancelar ? 'CANCELADA' : 'CONCLUIDA', arquivoUrl: b.arquivoUrl, duracaoSeg: b.duracaoSeg, transcricao: b.transcricao },
    })
    await audit({ tenantId, userId: getUserId(req), modulo: 'comunicacao', acao: b.cancelar ? 'GRAVACAO_CANCELADA' : 'GRAVACAO_ARQUIVADA', refType: 'ComGravacao', refId: g.id })
    res.json(r)
  }),
)

router.get(
  '/conversas/:id/gravacoes',
  requireRole(...ATENDE),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const c = await conversaOu404(req, res, String(req.params.id))
    if (!c) return
    if (!(await podeVerConversa(req, c as any))) return res.status(403).json({ error: 'Conversa sigilosa: sem acesso.' })
    const items = await prisma.comGravacao.findMany({ where: { tenantId: c.tenantId, conversaId: c.id }, orderBy: { createdAt: 'desc' } })
    res.json({ items })
  }),
)

export default router
