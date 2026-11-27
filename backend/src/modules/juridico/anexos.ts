import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { audit } from '../core/notify'
import { AuthenticatedRequest, Response, READ, WRITE, acessoTotal, asyncHandler, fail, pageParams, parseBody, requireRole, tid, uid } from './common'

// Anexos de qualquer registro jurídico. O corpo passa pelo uploadGuard global (tipo real, malware, URL segura):
// use `arquivoNome` + `mime` + (`arquivoUrl` https OU `dataUrl` até ~2 MB).
export const REFS: Record<string, string> = {
  Documento: 'jurDocumento', DocumentoVersao: 'jurDocumentoVersao', Contrato: 'jurContrato', Locacao: 'jurLocacao', ContratoPolo: 'jurContratoPolo',
  Processo: 'jurProcesso', Andamento: 'jurAndamento', Seguro: 'jurSeguro', Sinistro: 'jurSinistro', Imovel: 'jurImovel', Risco: 'jurRisco',
}
const MAX_DATAURL = 2_800_000

/** O registro existe neste tenant e o usuário pode vê-lo (confidencial/criminal/segredo de justiça exigem acesso total). */
export async function refAcessivel(req: AuthenticatedRequest, refType: string, refId: string): Promise<boolean> {
  const model = REFS[refType]
  if (!model) fail(400, `refType inválido. Use: ${Object.keys(REFS).join(', ')}.`)
  const tenantId = tid(req)
  const row = await (prisma as any)[model].findFirst({ where: { id: refId, tenantId } })
  if (!row) return false
  if (acessoTotal(req)) return true
  if (refType === 'Documento') return !row.confidencial
  if (refType === 'DocumentoVersao') { const d = await prisma.jurDocumento.findFirst({ where: { id: row.documentoId, tenantId } }); return !!d && !d.confidencial }
  const procId = refType === 'Processo' ? row.id : refType === 'Andamento' ? row.processoId : null
  if (procId) { const p = await prisma.jurProcesso.findFirst({ where: { id: procId, tenantId } }); return !!p && p.area !== 'CRIMINAL' && !p.segredoJustica }
  return true
}

const semDados = { id: true, tenantId: true, refType: true, refId: true, nome: true, url: true, mime: true, tamanhoBytes: true, descricao: true, enviadoPorId: true, createdAt: true }

export function registerAnexos(router: Router) {
  router.get('/anexos', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const refType = String(req.query.refType || ''), refId = String(req.query.refId || '')
    if (!refType || !refId) fail(400, 'Informe refType e refId.')
    if (!(await refAcessivel(req, refType, refId))) return res.status(404).json({ error: 'Registro não encontrado.' })
    const { skip, take } = pageParams(req.query)
    const items = await prisma.jurAnexo.findMany({ where: { tenantId: tid(req), refType, refId }, select: { ...semDados, dataUrl: false }, orderBy: { createdAt: 'desc' }, skip, take })
    res.json({ items: items.map((a) => ({ ...a, temArquivo: !a.url })), total: items.length })
  }))

  router.post('/anexos', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const b = parseBody(z.object({
      refType: z.string(), refId: z.string().uuid(), arquivoNome: z.string().min(1).max(200), mime: z.string().max(120).optional(),
      arquivoUrl: z.string().url().max(2000).optional(), dataUrl: z.string().max(MAX_DATAURL).optional(), descricao: z.string().max(500).optional(),
    }), req.body)
    if (!b.arquivoUrl && !b.dataUrl) fail(400, 'Informe arquivoUrl (https) ou dataUrl.')
    if (b.arquivoUrl && !/^https:\/\//i.test(b.arquivoUrl)) fail(400, 'arquivoUrl deve usar https.')
    if (b.dataUrl && !/^data:[\w.+/-]+;base64,/i.test(b.dataUrl)) fail(400, 'dataUrl inválido (esperado data:<tipo>;base64,...).')
    const tenantId = tid(req)
    if (!(await refAcessivel(req, b.refType, b.refId))) fail(404, 'Registro não encontrado.')
    const tamanho = b.dataUrl ? Math.floor(((b.dataUrl.length - b.dataUrl.indexOf(',') - 1) * 3) / 4) : undefined
    const mime = b.mime || (b.dataUrl ? b.dataUrl.slice(5, b.dataUrl.indexOf(';')) : undefined)
    const row = await prisma.jurAnexo.create({ data: { tenantId, refType: b.refType, refId: b.refId, nome: b.arquivoNome, url: b.arquivoUrl, dataUrl: b.dataUrl, mime, tamanhoBytes: tamanho, descricao: b.descricao, enviadoPorId: uid(req) } })
    await audit({ tenantId, userId: uid(req), modulo: 'juridico.anexos', acao: 'ANEXAR', refType: b.refType, refId: b.refId, detalhes: { anexoId: row.id, nome: b.arquivoNome } })
    const { dataUrl, ...out } = row
    res.status(201).json(out)
  }))

  router.get('/anexos/:id/download', requireRole(...READ), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.jurAnexo.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a || !(await refAcessivel(req, a.refType, a.refId))) return res.status(404).json({ error: 'Anexo não encontrado.' })
    await audit({ tenantId: tid(req), userId: uid(req), modulo: 'juridico.anexos', acao: 'BAIXAR', refType: a.refType, refId: a.refId, detalhes: { anexoId: a.id } })
    if (a.url && !a.dataUrl) return res.json({ url: a.url, nome: a.nome })
    const i = a.dataUrl!.indexOf(',')
    const buf = Buffer.from(a.dataUrl!.slice(i + 1), 'base64')
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', `attachment; filename="${a.nome.replace(/[^\w.\- ]+/g, '_').slice(0, 120)}"`)
    res.send(buf)
  }))

  router.delete('/anexos/:id', requireRole(...WRITE), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const a = await prisma.jurAnexo.findFirst({ where: { id: String(req.params.id), tenantId: tid(req) } })
    if (!a || !(await refAcessivel(req, a.refType, a.refId))) return res.status(404).json({ error: 'Anexo não encontrado.' })
    await prisma.jurAnexo.delete({ where: { id: a.id } })
    await audit({ tenantId: tid(req), userId: uid(req), modulo: 'juridico.anexos', acao: 'REMOVER', refType: a.refType, refId: a.refId, detalhes: { anexoId: a.id } })
    res.status(204).end()
  }))
}
