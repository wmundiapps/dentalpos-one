import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { ah, notFound } from '../lib/errors'
import type { AuthedRequest } from '../middleware/auth'
import { audit } from '../services/audit'
import { CatalogItemSchema } from '../services/catalog'

// Catálogo de ofertas (painel). A sincronização dos sistemas integrados fica em routes/integrations.ts.
const r = Router()

r.get(
  '/catalog',
  ah(async (req: AuthedRequest, res) => {
    const onlyActive = req.query.active !== 'all'
    res.json(
      await prisma.catalogItem.findMany({
        where: { tenantId: req.tenant.id, ...(onlyActive ? { isActive: true } : {}) },
        orderBy: [{ kind: 'asc' }, { title: 'asc' }],
        take: 2000,
      }),
    )
  }),
)

r.post(
  '/catalog',
  ah(async (req: AuthedRequest, res) => {
    const b = CatalogItemSchema.parse(req.body)
    const item = await prisma.catalogItem.create({
      data: { tenantId: req.tenant.id, source: 'MANUAL', externalRef: b.externalRef || null, kind: b.kind, title: b.title, subtitle: b.subtitle || null, imageUrl: b.imageUrl || null, url: b.url || null, isActive: b.isActive },
    })
    await audit(req.tenant.id, req.user.id, 'CATALOG_CREATE', 'CatalogItem', item.id)
    res.status(201).json(item)
  }),
)

r.patch(
  '/catalog/:id',
  ah(async (req: AuthedRequest, res) => {
    const found = await prisma.catalogItem.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Item não encontrado.')
    const b = CatalogItemSchema.partial().parse(req.body)
    const item = await prisma.catalogItem.update({
      where: { id: found.id },
      data: {
        ...(b.kind ? { kind: b.kind } : {}),
        ...(b.title ? { title: b.title } : {}),
        ...(b.subtitle !== undefined ? { subtitle: b.subtitle || null } : {}),
        ...(b.imageUrl !== undefined ? { imageUrl: b.imageUrl || null } : {}),
        ...(b.url !== undefined ? { url: b.url || null } : {}),
        ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
      },
    })
    res.json(item)
  }),
)

// Não apaga: desativa (campanhas antigas continuam apontando para o item).
r.delete(
  '/catalog/:id',
  ah(async (req: AuthedRequest, res) => {
    const found = await prisma.catalogItem.findFirst({ where: { id: req.params.id, tenantId: req.tenant.id } })
    if (!found) throw notFound('Item não encontrado.')
    await prisma.catalogItem.update({ where: { id: found.id }, data: { isActive: false } })
    await audit(req.tenant.id, req.user.id, 'CATALOG_DEACTIVATE', 'CatalogItem', found.id)
    res.json({ ok: true })
  }),
)

export default r
