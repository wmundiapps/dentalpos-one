import { Router } from 'express'
import {
  AuthenticatedRequest, GESTAO, LEITURA, REFS_ANEXO, Response, anexoSelect, asyncHandler, audit, criarAnexo, fail, getTenantId, getUserId, idParam, isGestao, MOD2, prisma, qs, z,
} from './common'

// Anexos/fotos: o solicitante pode anexar à própria solicitação; a gestão a qualquer registro; leitura ampla para LEITURA.
const MODELOS: Record<string, string> = { Solicitacao: 'inf2Solicitacao', Ordem: 'inf2OrdemServico', Agenda: 'inf2AgendaItem', Veiculo: 'inf2Veiculo', Multa: 'inf2Multa', Seguro: 'inf2Seguro', FrotaDoc: 'inf2FrotaDoc', FrotaManutencao: 'inf2FrotaManutencao', OcorrenciaSeg: 'inf2OcorrenciaSeg', Reserva: 'inf2Reserva' }
const leitores = ['FACILITIES', 'COORDINATOR', 'FINANCE', 'SUPPLIES', 'SECRETARY', 'SUPPORT', 'STAFF']

async function pode(req: AuthenticatedRequest, refType: string, refId: string, escrever: boolean): Promise<boolean> {
  const m = MODELOS[refType]
  if (!m) fail(400, `refType inválido. Use: ${REFS_ANEXO.join(', ')}.`)
  const row = await (prisma as any)[m].findFirst({ where: { id: refId, tenantId: getTenantId(req) } })
  if (!row) return false
  if (isGestao(req)) return true
  const role = String(req.user?.role).toUpperCase()
  if (refType === 'Solicitacao' && row.solicitanteUserId === getUserId(req)) return true
  if (refType === 'Reserva' && row.solicitanteUserId === getUserId(req)) return true
  if (refType === 'OcorrenciaSeg' && escrever && ['STAFF', 'SUPPORT', 'COORDINATOR'].includes(role)) return true
  if (!escrever && leitores.includes(role)) return true
  return false
}

export function mountAnexos(router: Router) {
  router.get('/anexos-infra', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const refType = qs(req.query.refType) ?? '', refId = qs(req.query.refId) ?? ''
    if (!refType || !refId) fail(400, 'Informe refType e refId.')
    if (!(await pode(req, refType, refId, false))) return res.status(404).json({ error: 'Registro não encontrado.' })
    const items = await prisma.inf2Anexo.findMany({ where: { tenantId: getTenantId(req), refType, refId }, select: anexoSelect, orderBy: { createdAt: 'desc' }, take: 100 })
    res.json({ items, total: items.length })
  }))
  router.post('/anexos-infra', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { refType, refId } = z.object({ refType: z.string(), refId: z.string().uuid() }).parse(req.body ?? {})
    if (!(await pode(req, refType, refId, true))) return res.status(404).json({ error: 'Registro não encontrado.' })
    const n = await prisma.inf2Anexo.count({ where: { tenantId: getTenantId(req), refType, refId } })
    if (n >= 20) fail(409, 'Limite de 20 anexos por registro.')
    const a = await criarAnexo(req, refType, refId, req.body)
    await audit({ tenantId: getTenantId(req), userId: getUserId(req), modulo: MOD2, acao: 'ANEXAR', refType, refId, detalhes: { anexoId: a.id, nome: a.nome } })
    res.status(201).json(a)
  }))
  router.get('/anexos-infra/:id/download', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.inf2Anexo.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) } })
    if (!a || !(await pode(req, a.refType, a.refId, false))) return res.status(404).json({ error: 'Anexo não encontrado.' })
    if (a.url && !a.dataUrl) return res.json({ url: a.url, nome: a.nome })
    const buf = Buffer.from(a.dataUrl!.slice(a.dataUrl!.indexOf(',') + 1), 'base64')
    res.setHeader('Content-Type', a.mime && /^image\/(png|jpe?g|webp|gif)$/.test(a.mime) ? a.mime : 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `inline; filename="${a.nome.replace(/[^\w.\- ]+/g, '_').slice(0, 120)}"`)
    res.send(buf)
  }))
  router.delete('/anexos-infra/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.inf2Anexo.findFirst({ where: { id: idParam(req), tenantId: getTenantId(req) } })
    if (!a || !(await pode(req, a.refType, a.refId, true))) return res.status(404).json({ error: 'Anexo não encontrado.' })
    if (!isGestao(req) && a.enviadoPorId !== getUserId(req)) fail(403, 'Somente quem enviou (ou a gestão) remove o anexo.')
    await prisma.inf2Anexo.delete({ where: { id: a.id } })
    res.status(204).end()
  }))
}
void GESTAO; void LEITURA
