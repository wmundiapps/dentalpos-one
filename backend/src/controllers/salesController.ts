import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { writeAudit } from '../services/auditService'
import { listCriticalStock } from '../services/stock5787'

const STORE_FLAG_KEY = 'sales.store.config'
const AFFILIATE_CATEGORY = 'AFFILIATE'
const AFFILIATE_META_PREFIX = 'AFFILIATE_METADATA:'

function context(req: Request) {
  const user = (req as any).user || {}
  return {
    clinicId: user.clinicId as string,
    tenantId: user.tenantId as string,
    actorId: user.id as string | undefined,
  }
}

function paramId(req: Request) {
  const value = req.params.id
  return Array.isArray(value) ? value[0] : value
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function money(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, parsed)
}

function text(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function dateOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function parseAffiliateMetadata(notes?: string | null) {
  if (!notes?.startsWith(AFFILIATE_META_PREFIX)) return {}
  try {
    return JSON.parse(notes.slice(AFFILIATE_META_PREFIX.length))
  } catch {
    return {}
  }
}

async function readStoreConfig(clinicId: string, tenantId: string) {
  const row = await prisma.tenantFeatureFlag.findFirst({
    where: { clinicId, tenantId, key: STORE_FLAG_KEY },
  })
  const metadata = (row?.metadata || {}) as Record<string, unknown>
  return {
    storefrontEnabled: row?.enabled ?? false,
    directDiscountPercent: clamp(metadata.directDiscountPercent, 0, 100, 5),
    affiliateCommissionPercent: clamp(metadata.affiliateCommissionPercent, 0, 100, 10),
  }
}

export async function leads(req: Request, res: Response) {
  const x = context(req)
  const rows = await prisma.salesLead.findMany({
    where: { clinicId: x.clinicId, tenantId: x.tenantId },
    orderBy: { updatedAt: 'desc' },
  })
  return res.json(rows)
}

export async function createLead(req: Request, res: Response) {
  const x = context(req)
  const name = String(req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'Nome do lead é obrigatório.' })

  const stage = String(req.body?.stage || 'NEW').trim().toUpperCase()
  const temperature = String(req.body?.temperature || 'WARM').trim().toUpperCase()

  const row = await prisma.salesLead.create({
    data: {
      clinicId: x.clinicId,
      tenantId: x.tenantId,
      name,
      company: text(req.body?.company),
      email: text(req.body?.email)?.toLowerCase() || null,
      phone: text(req.body?.phone),
      source: text(req.body?.source),
      stage,
      temperature,
      estimatedValue: money(req.body?.estimatedValue),
      nextAction: text(req.body?.nextAction),
      nextActionAt: dateOrNull(req.body?.nextActionAt),
      ownerId: text(req.body?.ownerId),
      notes: text(req.body?.notes),
      convertedAt: ['WON', 'CONVERTED'].includes(stage) ? new Date() : null,
      lostAt: stage === 'LOST' ? new Date() : null,
    },
  })

  await prisma.salesLeadEvent.create({
    data: {
      clinicId: x.clinicId,
      tenantId: x.tenantId,
      leadId: row.id,
      actorId: x.actorId,
      type: 'CREATED',
      toStage: row.stage,
      summary: `Lead ${row.name} criado`,
    },
  })

  await writeAudit({
    clinicId: x.clinicId,
    tenantId: x.tenantId,
    actorId: x.actorId,
    module: 'sales',
    action: 'LEAD_CREATE',
    entityType: 'SalesLead',
    entityId: row.id,
    afterData: row,
  })

  return res.status(201).json(row)
}

export async function updateLead(req: Request, res: Response) {
  const x = context(req)
  const leadId = paramId(req)
  const before = await prisma.salesLead.findFirst({
    where: { clinicId: x.clinicId, tenantId: x.tenantId, id: leadId },
  })
  if (!before) return res.status(404).json({ error: 'Lead não encontrado.' })

  const stage = req.body?.stage !== undefined
    ? String(req.body.stage).trim().toUpperCase()
    : before.stage
  const name = req.body?.name !== undefined
    ? String(req.body.name).trim()
    : before.name
  if (!name) return res.status(400).json({ error: 'Nome do lead é obrigatório.' })

  const row = await prisma.salesLead.update({
    where: { id: before.id },
    data: {
      name,
      company: req.body?.company !== undefined ? text(req.body.company) : undefined,
      email: req.body?.email !== undefined ? (text(req.body.email)?.toLowerCase() || null) : undefined,
      phone: req.body?.phone !== undefined ? text(req.body.phone) : undefined,
      source: req.body?.source !== undefined ? text(req.body.source) : undefined,
      stage,
      temperature: req.body?.temperature !== undefined
        ? String(req.body.temperature).trim().toUpperCase()
        : undefined,
      estimatedValue: req.body?.estimatedValue !== undefined
        ? money(req.body.estimatedValue)
        : undefined,
      nextAction: req.body?.nextAction !== undefined ? text(req.body.nextAction) : undefined,
      nextActionAt: req.body?.nextActionAt !== undefined
        ? dateOrNull(req.body.nextActionAt)
        : undefined,
      ownerId: req.body?.ownerId !== undefined ? text(req.body.ownerId) : undefined,
      notes: req.body?.notes !== undefined ? text(req.body.notes) : undefined,
      convertedAt: ['WON', 'CONVERTED'].includes(stage)
        ? (before.convertedAt || new Date())
        : stage !== before.stage
          ? null
          : undefined,
      lostAt: stage === 'LOST'
        ? (before.lostAt || new Date())
        : stage !== before.stage
          ? null
          : undefined,
    },
  })

  if (stage !== before.stage) {
    await prisma.salesLeadEvent.create({
      data: {
        clinicId: x.clinicId,
        tenantId: x.tenantId,
        leadId: row.id,
        actorId: x.actorId,
        type: 'STAGE_CHANGED',
        fromStage: before.stage,
        toStage: stage,
        summary: `${before.stage} → ${stage}`,
      },
    })
  }

  await writeAudit({
    clinicId: x.clinicId,
    tenantId: x.tenantId,
    actorId: x.actorId,
    module: 'sales',
    action: 'LEAD_UPDATE',
    entityType: 'SalesLead',
    entityId: row.id,
    beforeData: before,
    afterData: row,
  })

  return res.json(row)
}

export async function journey(req: Request, res: Response) {
  const x = context(req)
  const leadId = paramId(req)
  const exists = await prisma.salesLead.findFirst({
    where: { id: leadId, clinicId: x.clinicId, tenantId: x.tenantId },
    select: { id: true },
  })
  if (!exists) return res.status(404).json({ error: 'Lead não encontrado.' })

  return res.json(await prisma.salesLeadEvent.findMany({
    where: { clinicId: x.clinicId, tenantId: x.tenantId, leadId },
    orderBy: { createdAt: 'asc' },
  }))
}

export async function products(req: Request, res: Response) {
  const x = context(req)
  return res.json(await prisma.salesProduct.findMany({
    where: { clinicId: x.clinicId, tenantId: x.tenantId },
    orderBy: { name: 'asc' },
  }))
}

export async function criticalStock(req: Request, res: Response) {
  const x = context(req)
  return res.json(await listCriticalStock(x.clinicId, x.tenantId))
}

export async function upsertProduct(req: Request, res: Response) {
  const x = context(req)
  const sku = String(req.body?.sku || '').trim()
  if (!sku) return res.status(400).json({ error: 'SKU é obrigatório.' })

  const before = await prisma.salesProduct.findUnique({
    where: { clinicId_sku: { clinicId: x.clinicId, sku } },
  })

  const name = req.body?.name !== undefined ? String(req.body.name).trim() : before?.name
  if (!name) return res.status(400).json({ error: 'Nome do produto é obrigatório.' })

  const salePrice = req.body?.salePrice !== undefined
    ? money(req.body.salePrice)
    : Number(before?.salePrice ?? 0)
  const costPrice = req.body?.costPrice !== undefined
    ? money(req.body.costPrice)
    : Number(before?.costPrice ?? 0)
  const stockQuantity = req.body?.stockQuantity !== undefined
    ? money(req.body.stockQuantity)
    : Number(before?.stockQuantity ?? 0)
  const minStock = req.body?.minStock !== undefined
    ? money(req.body.minStock)
    : Number(before?.minStock ?? 0)

  const expiresAt = req.body?.expiresAt !== undefined
    ? dateOrNull(req.body.expiresAt)
    : before?.expiresAt

  const data = {
    name,
    barcode: req.body?.barcode !== undefined ? text(req.body.barcode) : before?.barcode,
    description: req.body?.description !== undefined ? text(req.body.description) : before?.description,
    salePrice,
    costPrice,
    stockQuantity,
    minStock,
    batchTracked: req.body?.batchTracked !== undefined
      ? Boolean(req.body.batchTracked)
      : (before?.batchTracked ?? false),
    expiresAt,
    active: req.body?.active !== undefined ? Boolean(req.body.active) : (before?.active ?? true),
  }

  const row = await prisma.salesProduct.upsert({
    where: { clinicId_sku: { clinicId: x.clinicId, sku } },
    update: data,
    create: {
      clinicId: x.clinicId,
      tenantId: x.tenantId,
      sku,
      ...data,
    },
  })

  await writeAudit({
    clinicId: x.clinicId,
    tenantId: x.tenantId,
    actorId: x.actorId,
    module: 'sales',
    action: before ? 'PRODUCT_UPDATE' : 'PRODUCT_CREATE',
    entityType: 'SalesProduct',
    entityId: row.id,
    beforeData: before,
    afterData: row,
  })

  return res.json(row)
}

export async function storeConfig(req: Request, res: Response) {
  const x = context(req)
  return res.json(await readStoreConfig(x.clinicId, x.tenantId))
}

export async function updateStoreConfig(req: Request, res: Response) {
  const x = context(req)
  const before = await readStoreConfig(x.clinicId, x.tenantId)
  const next = {
    storefrontEnabled: req.body?.storefrontEnabled !== undefined
      ? Boolean(req.body.storefrontEnabled)
      : before.storefrontEnabled,
    directDiscountPercent: clamp(
      req.body?.directDiscountPercent,
      0,
      100,
      before.directDiscountPercent,
    ),
    affiliateCommissionPercent: clamp(
      req.body?.affiliateCommissionPercent,
      0,
      100,
      before.affiliateCommissionPercent,
    ),
  }

  const row = await prisma.tenantFeatureFlag.upsert({
    where: { clinicId_key: { clinicId: x.clinicId, key: STORE_FLAG_KEY } },
    update: {
      tenantId: x.tenantId,
      enabled: next.storefrontEnabled,
      rolloutStage: 'PILOT_5787',
      metadata: {
        directDiscountPercent: next.directDiscountPercent,
        affiliateCommissionPercent: next.affiliateCommissionPercent,
      },
    },
    create: {
      clinicId: x.clinicId,
      tenantId: x.tenantId,
      key: STORE_FLAG_KEY,
      enabled: next.storefrontEnabled,
      rolloutStage: 'PILOT_5787',
      metadata: {
        directDiscountPercent: next.directDiscountPercent,
        affiliateCommissionPercent: next.affiliateCommissionPercent,
      },
    },
  })

  await writeAudit({
    clinicId: x.clinicId,
    tenantId: x.tenantId,
    actorId: x.actorId,
    module: 'sales',
    action: 'STORE_CONFIG_UPDATE',
    entityType: 'TenantFeatureFlag',
    entityId: row.id,
    beforeData: before,
    afterData: next,
  })

  return res.json(next)
}

export async function affiliateSuppliers(req: Request, res: Response) {
  const x = context(req)
  const rows = await prisma.supplier.findMany({
    where: {
      clinicId: x.clinicId,
      tenantId: x.tenantId,
      category: AFFILIATE_CATEGORY,
      isActive: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return res.json(rows.map((row) => ({
    id: row.id,
    legalName: row.name,
    tradeName: row.tradeName,
    document: row.document,
    email: row.email,
    phone: row.phone,
    ...parseAffiliateMetadata(row.notes),
    createdAt: row.createdAt,
  })))
}

export async function createAffiliateSupplier(req: Request, res: Response) {
  const x = context(req)
  const legalName = String(req.body?.legalName || '').trim()
  const document = String(req.body?.document || '').replace(/\D/g, '')
  const contactName = String(req.body?.contactName || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const phone = text(req.body?.phone)
  const storeUrl = text(req.body?.storeUrl)
  const acceptedTerms = Boolean(req.body?.acceptedTerms)

  if (!legalName || !document || !contactName || !email) {
    return res.status(400).json({
      error: 'Razão social/nome, documento, responsável e e-mail são obrigatórios.',
    })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' })
  }
  if (!acceptedTerms) {
    return res.status(400).json({ error: 'É necessário aceitar as condições comerciais.' })
  }

  const existing = await prisma.supplier.findFirst({
    where: { clinicId: x.clinicId, tenantId: x.tenantId, document },
  })
  if (existing) {
    return res.status(409).json({ error: 'Já existe um fornecedor com este CNPJ/CPF.' })
  }

  const config = await readStoreConfig(x.clinicId, x.tenantId)
  const commissionPercent = clamp(
    req.body?.commissionPercent,
    0,
    100,
    config.affiliateCommissionPercent,
  )
  const acceptedAt = new Date()
  const metadata = {
    contactName,
    storeUrl,
    status: 'PENDING',
    commissionPercent,
    acceptedTerms: true,
    acceptedAt: acceptedAt.toISOString(),
  }

  const row = await prisma.supplier.create({
    data: {
      clinicId: x.clinicId,
      tenantId: x.tenantId,
      name: legalName,
      tradeName: text(req.body?.tradeName),
      document,
      email,
      phone,
      category: AFFILIATE_CATEGORY,
      paymentTerms: `COMISSAO_${commissionPercent}%`,
      notes: `${AFFILIATE_META_PREFIX}${JSON.stringify(metadata)}`,
      isActive: true,
    },
  })

  await writeAudit({
    clinicId: x.clinicId,
    tenantId: x.tenantId,
    actorId: x.actorId,
    module: 'sales',
    action: 'AFFILIATE_SUPPLIER_CREATE',
    entityType: 'Supplier',
    entityId: row.id,
    afterData: metadata,
  })

  return res.status(201).json({
    id: row.id,
    legalName: row.name,
    tradeName: row.tradeName,
    document: row.document,
    email: row.email,
    phone: row.phone,
    ...metadata,
    createdAt: row.createdAt,
  })
}
