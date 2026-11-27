// Galeria de fotos do patrimônio: várias fotos por bem, foto principal, upload passando pela varredura de segurança.
import { Router, Response } from 'express'
import { z } from 'zod'
import { createHash } from 'crypto'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { parseBody } from '../core/crud'
import { audit } from '../core/notify'
import { lerDataUrl, mensagemBloqueio, scanUpload } from '../seguranca/uploads'
import { GESTAO, LEITURA, MODULO, fail } from './util'

export const MAX_FOTOS_POR_BEM = 12
export const MAX_BYTES_FOTO = Number(process.env.CPP_FOTO_MAX_BYTES || 1_500_000)   // o corpo JSON da API é limitado (API_BODY_LIMIT, 2 MB): o front reduz a foto antes de enviar
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

const meta = (f: { id: string; bemId: string; nome: string; mime: string; tamanho: number; principal: boolean; ordem: number; legenda: string | null; createdAt: Date }) => ({
  id: f.id, bemId: f.bemId, nome: f.nome, mime: f.mime, tamanho: f.tamanho, principal: f.principal, ordem: f.ordem, legenda: f.legenda, createdAt: f.createdAt,
  url: `/api/edu/infraestrutura/fotos-bem/${f.id}/arquivo`,
})
const SEL = { id: true, tenantId: true, bemId: true, nome: true, mime: true, tamanho: true, principal: true, ordem: true, legenda: true, createdAt: true } as const

export function mountFotos(router: Router) {
  router.get('/bens/:id/fotos', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const bem = await prisma.infBem.findFirst({ where: { id: String(req.params.id), tenantId }, select: { id: true, fotoPrincipalId: true } })
    if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
    const fotos = await prisma.cppBemFoto.findMany({ where: { tenantId, bemId: bem.id }, select: SEL, orderBy: [{ principal: 'desc' }, { ordem: 'asc' }, { createdAt: 'asc' }] })
    res.json({ items: fotos.map(meta), total: fotos.length, limite: MAX_FOTOS_POR_BEM, principalId: bem.fotoPrincipalId })
  }))

  router.post('/bens/:id/fotos', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const userId = getUserId(req)
    const d = parseBody(z.object({ nome: z.string().max(120).optional(), dataUrl: z.string().regex(/^data:image\/[\w.+-]+;base64,/, 'Envie a imagem como data URL base64.'), legenda: z.string().max(200).optional(), principal: z.boolean().optional() }), req.body)
    const bem = await prisma.infBem.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!bem) return res.status(404).json({ error: 'Bem não encontrado.' })
    const lida = lerDataUrl(d.dataUrl)
    if (!lida) fail(400, 'Imagem inválida.')
    if (lida.buffer.length > MAX_BYTES_FOTO) fail(413, `Foto acima de ${(MAX_BYTES_FOTO / 1_000_000).toFixed(1)} MB: reduza a resolução e envie novamente.`)
    const nome = (d.nome || `foto-${bem.tombamento}`).replace(/[^\w.\- ]+/g, '_').slice(0, 100)
    // Varredura de segurança (tipo real por assinatura, malware, moderação): só imagem é aceita.
    const scan = await scanUpload({ filename: /\.\w{2,4}$/.test(nome) ? nome : `${nome}.${EXT[lida.mime] ?? 'jpg'}`, declaredMime: lida.mime, data: lida.buffer, permitir: ['imagem'], contexto: { tenantId, userId, origem: 'infraestrutura/bens/fotos' } })
    if (!scan.ok) fail(422, mensagemBloqueio(scan))
    const mime = scan.mime ?? lida.mime
    if (!MIMES.has(mime)) fail(422, 'Formato de imagem não aceito (use JPEG, PNG, WebP ou GIF).')
    const sha256 = createHash('sha256').update(lida.buffer).digest('hex')
    const foto = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "InfBem" WHERE "id" = ${bem.id} FOR UPDATE`
      const qtd = await tx.cppBemFoto.count({ where: { tenantId, bemId: bem.id } })
      if (qtd >= MAX_FOTOS_POR_BEM) fail(409, `Limite de ${MAX_FOTOS_POR_BEM} fotos por bem atingido.`)
      if (await tx.cppBemFoto.findFirst({ where: { tenantId, bemId: bem.id, sha256 } })) fail(409, 'Esta foto já foi enviada para o bem.')
      const virarPrincipal = d.principal === true || qtd === 0
      if (virarPrincipal) await tx.cppBemFoto.updateMany({ where: { tenantId, bemId: bem.id, principal: true }, data: { principal: false } })
      const f = await tx.cppBemFoto.create({ data: { tenantId, bemId: bem.id, nome, mime, tamanho: lida.buffer.length, sha256, dados: lida.buffer, principal: virarPrincipal, ordem: qtd, legenda: d.legenda ?? null, enviadoPorId: userId } })
      if (virarPrincipal) await tx.infBem.update({ where: { id: bem.id }, data: { fotoPrincipalId: f.id } })
      return f
    })
    await audit({ tenantId, userId, modulo: MODULO, acao: 'BEM_FOTO_ENVIADA', refType: 'InfBem', refId: bem.id, detalhes: { fotoId: foto.id, tamanho: foto.tamanho, veredito: scan.veredito } })
    res.status(201).json({ ...meta(foto), veredito: scan.veredito, avisos: scan.avisos })
  }))

  router.get('/fotos-bem/:fotoId/arquivo', requireRole(...LEITURA, 'TEACHER', 'STAFF'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const f = await prisma.cppBemFoto.findFirst({ where: { id: String(req.params.fotoId), tenantId: getTenantId(req) } })
    if (!f) return res.status(404).json({ error: 'Foto não encontrada.' })
    res.setHeader('Content-Type', MIMES.has(f.mime) ? f.mime : 'application/octet-stream')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; sandbox")
    res.setHeader('Content-Disposition', `inline; filename="${f.nome.replace(/"/g, '')}"`)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.send(Buffer.from(f.dados))
  }))

  router.patch('/fotos-bem/:fotoId', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const d = parseBody(z.object({ legenda: z.string().max(200).nullable().optional(), ordem: z.coerce.number().int().min(0).max(100).optional() }), req.body)
    const f = await prisma.cppBemFoto.findFirst({ where: { id: String(req.params.fotoId), tenantId }, select: SEL })
    if (!f) return res.status(404).json({ error: 'Foto não encontrada.' })
    res.json(meta(await prisma.cppBemFoto.update({ where: { id: f.id }, data: d, select: SEL })))
  }))

  router.post('/fotos-bem/:fotoId/principal', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const f = await prisma.cppBemFoto.findFirst({ where: { id: String(req.params.fotoId), tenantId }, select: SEL })
    if (!f) return res.status(404).json({ error: 'Foto não encontrada.' })
    await prisma.$transaction([
      prisma.cppBemFoto.updateMany({ where: { tenantId, bemId: f.bemId, principal: true }, data: { principal: false } }),
      prisma.cppBemFoto.update({ where: { id: f.id }, data: { principal: true } }),
      prisma.infBem.update({ where: { id: f.bemId }, data: { fotoPrincipalId: f.id } }),
    ])
    res.json({ ok: true, principalId: f.id })
  }))

  router.delete('/fotos-bem/:fotoId', requireRole(...GESTAO), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const f = await prisma.cppBemFoto.findFirst({ where: { id: String(req.params.fotoId), tenantId }, select: SEL })
    if (!f) return res.status(404).json({ error: 'Foto não encontrada.' })
    await prisma.$transaction(async (tx) => {
      await tx.cppBemFoto.delete({ where: { id: f.id } })
      if (f.principal) {
        const prox = await tx.cppBemFoto.findFirst({ where: { tenantId, bemId: f.bemId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }], select: { id: true } })
        if (prox) await tx.cppBemFoto.update({ where: { id: prox.id }, data: { principal: true } })
        await tx.infBem.update({ where: { id: f.bemId }, data: { fotoPrincipalId: prox?.id ?? null } })
      }
    })
    await audit({ tenantId, userId: getUserId(req), modulo: MODULO, acao: 'BEM_FOTO_REMOVIDA', refType: 'InfBem', refId: f.bemId, detalhes: { fotoId: f.id } })
    res.status(204).end()
  }))
}
