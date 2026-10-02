import { Router, Response, Request } from 'express'
import { prisma } from '../../lib/prisma'
import { asyncHandler, academicErrorHandler } from '../academico/middleware'
import { pageParams, qs } from '../core/crud'
import { buscarCatalogo } from './acervo'
import { normalizarBusca, situacaoAcesso } from './logic'
import { dcDoItem, enviarArquivo, fichaHtml, itemParaPublico } from './repositorio'

// Rotas PÚBLICAS (sem login). O tenant vem no caminho: /api/public/edu/biblioteca/:tenantId/...
export const publicRouter = Router()

const tid = (req: Request) => String(req.params.tenantId)
const nf = (res: Response, m: string) => res.status(404).json({ error: m })

publicRouter.get('/:tenantId/catalogo', asyncHandler(async (req, res) => {
  res.json(await buscarCatalogo(tid(req), req.query, { publico: true }))
}))

publicRouter.get('/:tenantId/catalogo/:obraId', asyncHandler(async (req, res) => {
  const tenantId = tid(req)
  const obra = await prisma.bibObra.findFirst({ where: { id: String(req.params.obraId), tenantId, ativo: true } })
  if (!obra) return nf(res, 'Obra não encontrada.')
  const exs = await prisma.bibExemplar.findMany({ where: { tenantId, obraId: obra.id, status: { notIn: ['BAIXADO', 'EXTRAVIADO'] } }, select: { tombo: true, status: true, estante: true, prateleira: true, spaceId: true, apenasConsulta: true, estado: true } })
  const spaces = await prisma.eduSpace.findMany({ where: { tenantId, id: { in: [...new Set(exs.map((e) => e.spaceId).filter(Boolean) as string[])] } }, select: { id: true, nome: true, bloco: true, andar: true } })
  const virtuais = await prisma.bibRecursoVirtual.findMany({ where: { tenantId, obraId: obra.id, ativo: true }, select: { id: true, titulo: true, tipoAcesso: true } })
  const fila = await prisma.bibReserva.count({ where: { tenantId, obraId: obra.id, status: 'AGUARDANDO' } })
  const { createdAt, updatedAt, tenantId: _t, ...pub } = obra
  void createdAt; void updatedAt; void _t
  res.json({
    ...pub, filaReservas: fila, recursosVirtuais: virtuais,
    exemplares: exs.map((e) => ({ tombo: e.tombo, situacao: e.status === 'DISPONIVEL' ? (e.apenasConsulta ? 'CONSULTA_LOCAL' : 'DISPONIVEL') : 'INDISPONIVEL', estante: e.estante, prateleira: e.prateleira, local: spaces.find((s) => s.id === e.spaceId) ?? null })),
  })
}))

publicRouter.get('/:tenantId/virtual', asyncHandler(async (req, res) => {
  const tenantId = tid(req)
  const where: any = { tenantId, ativo: true }
  if (qs(req.query.tipo)) where.tipo = qs(req.query.tipo)
  const q = qs(req.query.q)
  if (q) where.OR = ['titulo', 'autores', 'provedor', 'assuntos'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }))
  // somente recursos de acesso livre expõem a URL publicamente
  const rs = await prisma.bibRecursoVirtual.findMany({ where, orderBy: { titulo: 'asc' }, take: 200 })
  res.json(rs.map((r) => ({ id: r.id, tipo: r.tipo, titulo: r.titulo, autores: r.autores, provedor: r.provedor, tipoAcesso: r.tipoAcesso, descricao: r.descricao, url: r.tipoAcesso === 'ACESSO_LIVRE' ? r.url : null, requerLogin: r.tipoAcesso !== 'ACESSO_LIVRE' })))
}))

const pubWhere = (tenantId: string) => ({ tenantId, status: 'PUBLICADO' as const })

publicRouter.get('/:tenantId/repositorio', asyncHandler(async (req, res) => {
  const tenantId = tid(req)
  const { skip, take, page, pageSize } = pageParams({ ...req.query, pageSize: Math.min(50, Number(qs(req.query.pageSize)) || 20) })
  const where: any = pubWhere(tenantId)
  const q = qs(req.query.q)
  if (q) where.AND = normalizarBusca(q).split(/\s+/).filter(Boolean).slice(0, 8).map((t) => ({ buscaTexto: { contains: t } }))
  if (qs(req.query.tipo)) where.tipo = qs(req.query.tipo)
  if (qs(req.query.programId)) where.programId = qs(req.query.programId)
  const ano = Number(qs(req.query.ano))
  if (ano) where.dataPublicacao = { gte: new Date(Date.UTC(ano, 0, 1)), lt: new Date(Date.UTC(ano + 1, 0, 1)) }
  const [rows, total] = await Promise.all([
    prisma.bibRepositorioItem.findMany({ where, orderBy: { dataPublicacao: 'desc' }, skip, take, select: { id: true, handle: true, tipo: true, status: true, titulo: true, criadores: true, orientador: true, assuntos: true, descricao: true, dataPublicacao: true, embargoAte: true, restrito: true, licenca: true, programId: true, idioma: true, arquivoUrl: true } }),
    prisma.bibRepositorioItem.count({ where }),
  ])
  res.json({ items: rows.map((r) => itemParaPublico(r)), total, page, pageSize })
}))

async function achar(req: Request) {
  return prisma.bibRepositorioItem.findFirst({ where: { ...pubWhere(tid(req)), OR: [{ id: String(req.params.id) }, { handle: String(req.params.id) }] } })
}

publicRouter.get('/:tenantId/repositorio/:id', asyncHandler(async (req, res) => {
  const i = await achar(req)
  if (!i) return nf(res, 'Item não encontrado.')
  await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: { visualizacoes: { increment: 1 } } })
  res.json(itemParaPublico(i))
}))

publicRouter.get('/:tenantId/repositorio/:id/arquivo', asyncHandler(async (req, res) => {
  const i = await achar(req)
  if (!i) return nf(res, 'Item não encontrado.')
  const ac = situacaoAcesso(i)
  if (ac === 'EMBARGADO') return res.status(403).json({ error: `Arquivo sob embargo até ${i.embargoAte?.toLocaleDateString('pt-BR')}.` })
  if (ac === 'RESTRITO') return res.status(401).json({ error: 'Acesso restrito à comunidade acadêmica: faça login.' })
  await prisma.bibRepositorioItem.update({ where: { id: i.id }, data: { downloads: { increment: 1 } } })
  return enviarArquivo(res, i)
}))

publicRouter.get('/:tenantId/repositorio/:id/dublin-core', asyncHandler(async (req, res) => {
  const i = await achar(req)
  if (!i) return nf(res, 'Item não encontrado.')
  res.type('application/xml').send(dcDoItem(i))
}))

publicRouter.get('/:tenantId/repositorio/:id/ficha-catalografica', asyncHandler(async (req, res) => {
  const i = await achar(req)
  if (!i) return nf(res, 'Item não encontrado.')
  res.type('html').send(await fichaHtml(i))
}))

publicRouter.use(academicErrorHandler)
