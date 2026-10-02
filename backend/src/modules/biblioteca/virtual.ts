import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from '../academico/middleware'
import { mountCrud, qs } from '../core/crud'
import { BIB, LEITURA, MOD, USUARIOS, httpErr, optDate } from './common'
import { normalizarIsbn } from './logic'

// Decide se o usuário pode acessar o recurso. Integra com LibraryProvider/StudentLibraryAccess (módulo conteudo), somente leitura.
export async function verificarAcessoVirtual(tenantId: string, recurso: { tipoAcesso: string; libraryProviderId: string | null; ativo: boolean; vigenciaFim: Date | null }, user: { role: string; studentId?: string }) {
  if (!recurso.ativo) return { permitido: false, motivo: 'Recurso inativo.' }
  if (recurso.vigenciaFim && recurso.vigenciaFim < new Date()) return { permitido: false, motivo: 'Assinatura vencida.' }
  if (recurso.tipoAcesso === 'ACESSO_LIVRE') return { permitido: true }
  let institucional = recurso.tipoAcesso === 'ASSINATURA_INSTITUCIONAL'
  if (recurso.libraryProviderId) {
    const prov = await prisma.libraryProvider.findFirst({ where: { id: recurso.libraryProviderId, tenantId } })
    if (!prov || !prov.ativo) return { permitido: false, motivo: 'Provedor de biblioteca inativo ou inexistente.' }
    institucional = prov.tipoAcesso === 'ASSINATURA_INSTITUCIONAL'
    if (!institucional && user.studentId) {
      const acc = await prisma.studentLibraryAccess.findFirst({ where: { studentId: user.studentId, libraryProviderId: prov.id, status: 'ATIVA' } })
      if (!acc) return { permitido: false, motivo: `Acesso ao provedor "${prov.nome}" requer adesão individual ativa (módulo conteúdo).` }
    }
  } else if (!institucional && user.studentId) {
    return { permitido: false, motivo: 'Recurso de URL pessoal: solicite credenciais à biblioteca.' }
  }
  return { permitido: true }
}

export function mountVirtual(router: Router) {
  router.get('/virtual/provedores', requireRole(...LEITURA), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const provs = await prisma.libraryProvider.findMany({ where: { tenantId }, orderBy: { nome: 'asc' } })
    const ativos = await prisma.studentLibraryAccess.groupBy({ by: ['libraryProviderId'], where: { libraryProviderId: { in: provs.map((p) => p.id) }, status: 'ATIVA' }, _count: { _all: true } })
    const recs = await prisma.bibRecursoVirtual.groupBy({ by: ['libraryProviderId'], where: { tenantId, libraryProviderId: { in: provs.map((p) => p.id) } }, _count: { _all: true } })
    res.json(provs.map((p) => ({ ...p, alunosAtivos: ativos.find((a) => a.libraryProviderId === p.id)?._count._all ?? 0, recursosCatalogados: recs.find((a) => a.libraryProviderId === p.id)?._count._all ?? 0 })))
  }))

  // catálogo para o usuário logado, já com a permissão de acesso calculada
  router.get('/virtual/catalogo', requireRole(...USUARIOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const where: any = { tenantId, ativo: true }
    if (qs(req.query.tipo)) where.tipo = qs(req.query.tipo)
    const q = qs(req.query.q)
    if (q) where.OR = ['titulo', 'autores', 'provedor', 'assuntos', 'descricao'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' } }))
    const recs = await prisma.bibRecursoVirtual.findMany({ where, orderBy: { titulo: 'asc' }, take: 200 })
    const items = []
    for (const r of recs) {
      const a = await verificarAcessoVirtual(tenantId, r, req.user as any)
      items.push({ id: r.id, tipo: r.tipo, titulo: r.titulo, autores: r.autores, provedor: r.provedor, tipoAcesso: r.tipoAcesso, descricao: r.descricao, permitido: a.permitido, motivo: a.motivo })
    }
    res.json({ items, total: items.length })
  }))

  // registra o acesso (métrica de uso) e devolve a URL
  router.post('/virtual/recursos/:id/acessar', requireRole(...USUARIOS), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = getTenantId(req)
    const r = await prisma.bibRecursoVirtual.findFirst({ where: { id: String(req.params.id), tenantId } })
    if (!r) return res.status(404).json({ error: 'Recurso não encontrado.' })
    const a = await verificarAcessoVirtual(tenantId, r, req.user as any)
    if (!a.permitido) return res.status(403).json({ error: a.motivo })
    await prisma.bibAcessoVirtual.create({ data: { tenantId, recursoId: r.id, studentId: req.user?.studentId, userId: req.user?.studentId ? undefined : getUserId(req) } })
    res.json({ url: r.url, titulo: r.titulo })
  }))

  mountCrud(router, {
    model: 'bibRecursoVirtual', path: '/virtual/recursos', read: LEITURA, write: BIB, modulo: MOD,
    create: z.object({
      tipo: z.enum(['EBOOK', 'PERIODICO', 'BASE_DADOS', 'VIDEO', 'OUTRO']).default('EBOOK'), titulo: z.string().trim().min(2), autores: z.string().optional().nullable(),
      provedor: z.string().optional().nullable(), url: z.string().url('URL inválida'), tipoAcesso: z.enum(['ASSINATURA_INSTITUCIONAL', 'URL_PESSOAL', 'ACESSO_LIVRE']).default('ASSINATURA_INSTITUCIONAL'),
      libraryProviderId: z.string().optional().nullable(), obraId: z.string().optional().nullable(), isbn: z.string().optional().nullable(), issn: z.string().optional().nullable(),
      assuntos: z.string().optional().nullable(), descricao: z.string().optional().nullable(), vigenciaFim: optDate, ativo: z.boolean().optional(),
    }),
    search: ['titulo', 'autores', 'provedor', 'assuntos'], filters: ['tipo', 'tipoAcesso', 'ativo', 'libraryProviderId', 'obraId'], orderBy: { titulo: 'asc' },
    beforeCreate: async (d, req) => validar(d, getTenantId(req)),
    beforeUpdate: async (d, req) => validar(d, getTenantId(req)),
  })
}

async function validar(d: any, tenantId: string) {
  if (d.libraryProviderId && !(await prisma.libraryProvider.findFirst({ where: { id: d.libraryProviderId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Provedor (LibraryProvider) não encontrado.')
  if (d.obraId && !(await prisma.bibObra.findFirst({ where: { id: d.obraId, tenantId }, select: { id: true } }))) throw httpErr(404, 'Obra não encontrada.')
  if (d.isbn) d.isbn = normalizarIsbn(d.isbn)
  return d
}
