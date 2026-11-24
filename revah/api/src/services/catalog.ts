// Catálogo de ofertas: de onde saem os cards do carrossel.
// Cadastro manual no painel ou sincronizado pelos sistemas integrados (cursos do EduMaster, tratamentos do DentalPos).
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { badRequest } from '../lib/errors'

export const CATALOG_KINDS = ['CURSO', 'TRATAMENTO', 'PRODUTO', 'SERVICO', 'OFERTA'] as const
export const CATALOG_SOURCES = ['MANUAL', 'DENTALPOS', 'EDUMASTER', 'API'] as const

export const CatalogItemSchema = z.object({
  externalRef: z.string().trim().max(160).nullable().optional(),
  kind: z.enum(CATALOG_KINDS).default('OFERTA'),
  title: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(90).nullable().optional(),
  imageUrl: z.string().trim().url().nullable().optional(),
  url: z.string().trim().url().nullable().optional(),
  isActive: z.boolean().default(true),
})

export type CatalogItemInput = z.infer<typeof CatalogItemSchema>

// Sincronização em lote (idempotente por externalRef). Itens da mesma origem que não vieram são desativados,
// nunca apagados (campanhas antigas continuam apontando para eles).
export async function syncCatalog(tenantId: string, source: (typeof CATALOG_SOURCES)[number], raw: unknown, opts: { deactivateMissing?: boolean } = {}) {
  const items = z.array(CatalogItemSchema).max(2000).parse(raw)
  const missingRef = items.filter((i) => !i.externalRef)
  if (missingRef.length) throw badRequest('Cada item sincronizado precisa de externalRef.')
  let upserted = 0
  for (const item of items) {
    const data = {
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle || null,
      imageUrl: item.imageUrl || null,
      url: item.url || null,
      isActive: item.isActive,
      source,
    }
    await prisma.catalogItem.upsert({
      where: { tenantId_externalRef: { tenantId, externalRef: item.externalRef! } },
      create: { tenantId, externalRef: item.externalRef!, ...data },
      update: data,
    })
    upserted += 1
  }
  let deactivated = 0
  if (opts.deactivateMissing) {
    const r = await prisma.catalogItem.updateMany({
      where: { tenantId, source, isActive: true, externalRef: { notIn: items.map((i) => i.externalRef!) } },
      data: { isActive: false },
    })
    deactivated = r.count
  }
  return { upserted, deactivated }
}
