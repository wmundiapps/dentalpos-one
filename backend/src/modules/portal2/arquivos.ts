import { Router, Response } from 'express'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId } from '../academico/middleware'
import { audit } from '../core/notify'
import { decodificar } from '../analise-docs/provedores'
import { bodyOf, httpErr, qs, turmaAcesso } from './common'

// ============================================================================
// REPOSITÓRIO DE ARQUIVOS da sala virtual: Word/Excel/PDF/foto enviados de verdade (base64), não link.
// Sem servidor de blob próprio neste ambiente — o conteúdo fica em Postgres (coluna Text), por isso o limite de
// tamanho abaixo. Montado junto do resto do portal2 (prefixo /turmas e /arquivos, como em ead.ts).
// ============================================================================
const router = Router()

const MIME_AVISOS = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.ms-excel|application\/vnd\.ms-powerpoint|image\/(png|jpe?g|webp|gif))$/i
const TAMANHO_MAXIMO = 15 * 1024 * 1024 // 15MB decodificado

const uploadSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  dataUrl: z.string().min(1).max(25_000_000),
  cadernoId: z.string().optional().nullable(),
})

async function cadernoDaTurma(tenantId: string, classSectionId: string, cadernoId?: string | null) {
  if (!cadernoId) return null
  const c = await prisma.porCaderno.findFirst({ where: { id: cadernoId, tenantId, classSectionId } })
  if (!c) throw httpErr(404, 'Caderno não encontrado nesta turma.')
  return c
}

router.get('/turmas/:id/arquivos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec } = await turmaAcesso(req, String(req.params.id))
  const cadernoId = qs(req.query.cadernoId)
  const itens = await prisma.porArquivo.findMany({
    where: { tenantId, classSectionId: sec.id, ...(cadernoId ? { cadernoId } : {}) },
    select: { id: true, nome: true, mime: true, tamanho: true, cadernoId: true, autorUserId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ itens })
}))

router.post('/turmas/:id/arquivos', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const { sec } = await turmaAcesso(req, String(req.params.id), { soDocente: true })
  const d = bodyOf(uploadSchema, req)
  const caderno = await cadernoDaTurma(tenantId, sec.id, d.cadernoId)
  const lido = decodificar({ dataUrl: d.dataUrl })
  if (!lido) throw httpErr(400, 'Arquivo ilegível: envie um data URL válido.')
  const mime = (lido.mime || '').toLowerCase()
  if (!MIME_AVISOS.test(mime)) throw httpErr(400, 'Tipo de arquivo não permitido. Envie Word, Excel, PowerPoint, PDF ou foto (JPG/PNG/WebP).')
  if (lido.buf.length > TAMANHO_MAXIMO) throw httpErr(400, `Arquivo maior que o limite de ${TAMANHO_MAXIMO / 1024 / 1024}MB.`)
  const hash = createHash('sha256').update(lido.buf).digest('hex')
  const a = await prisma.porArquivo.create({
    data: {
      tenantId, classSectionId: sec.id, cadernoId: caderno?.id ?? null, autorUserId: getUserId(req),
      nome: d.nome.slice(0, 200), mime, tamanho: lido.buf.length, hash, conteudo: lido.buf.toString('base64'),
    },
    select: { id: true, nome: true, mime: true, tamanho: true, cadernoId: true, autorUserId: true, createdAt: true },
  })
  await audit({ tenantId, userId: getUserId(req), modulo: 'portal2', acao: 'ARQUIVO_ENVIADO', refType: 'PorArquivo', refId: a.id, detalhes: { mime: a.mime, tamanho: a.tamanho } })
  res.status(201).json(a)
}))

router.get('/arquivos/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.porArquivo.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) throw httpErr(404, 'Arquivo não encontrado.')
  await turmaAcesso(req, a.classSectionId)
  const buf = Buffer.from(a.conteudo, 'base64')
  res.setHeader('Content-Type', a.mime)
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(a.nome)}"`)
  res.send(buf)
}))

router.delete('/arquivos/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const a = await prisma.porArquivo.findFirst({ where: { id: String(req.params.id), tenantId } })
  if (!a) throw httpErr(404, 'Arquivo não encontrado.')
  await turmaAcesso(req, a.classSectionId, { soDocente: true })
  await prisma.porArquivo.delete({ where: { id: a.id } })
  res.json({ ok: true })
}))

export default router
