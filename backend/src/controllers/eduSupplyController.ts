import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { purchaseOrderSchema, saleSchema, stockAdjustmentSchema, supplyItemSchema } from '../validators/eduSupplyValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

// ---------------------------------------------------------------
// ITENS DE ESTOQUE
// ---------------------------------------------------------------

export async function listSupplyItems(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const lowStockOnly = req.query.lowStock === 'true'
    const rows = await prisma.eduSupplyItem.findMany({ where: { clinicId, tenantId, isActive: true }, orderBy: { name: 'asc' } })
    return res.json(lowStockOnly ? rows.filter(row => row.currentQuantity <= row.minQuantity) : rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar itens de estoque.' })
  }
}

export async function createSupplyItem(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = supplyItemSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const duplicate = await prisma.eduSupplyItem.findFirst({ where: { clinicId, code: parsed.data.code } })
    if (duplicate) return res.status(409).json({ error: 'Já existe um item com este código.' })

    const row = await prisma.eduSupplyItem.create({ data: { clinicId, tenantId, ...parsed.data } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_SUPPLY_ITEM_CREATE', entityType: 'EduSupplyItem', entityId: row.id, summary: `Item de estoque "${row.name}" cadastrado.` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar item de estoque.' })
  }
}

export async function adjustStock(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const itemId = String(req.params.itemId)
    const item = await prisma.eduSupplyItem.findFirst({ where: { id: itemId, clinicId, tenantId } })
    if (!item) return res.status(404).json({ error: 'Item de estoque não encontrado.' })

    const parsed = stockAdjustmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const delta = parsed.data.type === 'SAIDA' ? -Math.abs(parsed.data.quantity) : Math.abs(parsed.data.quantity)
    const newQuantity = item.currentQuantity + delta
    if (newQuantity < 0) return res.status(409).json({ error: 'Saída maior que o estoque disponível.' })

    const [, row] = await prisma.$transaction([
      prisma.eduSupplyMovement.create({ data: { clinicId, tenantId, itemId, type: parsed.data.type, quantity: delta, reason: parsed.data.reason, createdById: actorId } }),
      prisma.eduSupplyItem.update({ where: { id: itemId }, data: { currentQuantity: newQuantity } })
    ])
    await audit({ clinicId, tenantId, actorId, action: 'EDU_STOCK_ADJUST', entityType: 'EduSupplyItem', entityId: itemId, summary: `Estoque de "${item.name}" ajustado (${parsed.data.type} ${parsed.data.quantity}).` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao ajustar estoque.' })
  }
}

// ---------------------------------------------------------------
// COMPRAS — recebimento gera entrada de estoque + conta a pagar
// ---------------------------------------------------------------

export async function listPurchaseOrders(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduPurchaseOrder.findMany({ where: { clinicId, tenantId, ...(status ? { status } : {}) }, include: { items: true }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar pedidos de compra.' })
  }
}

export async function createPurchaseOrder(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = purchaseOrderSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const totalAmount = parsed.data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const row = await prisma.eduPurchaseOrder.create({
      data: {
        clinicId, tenantId, requestedById: actorId, supplierName: parsed.data.supplierName, notes: parsed.data.notes, totalAmount,
        items: { create: parsed.data.items }
      },
      include: { items: true }
    })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PURCHASE_ORDER_CREATE', entityType: 'EduPurchaseOrder', entityId: row.id, summary: `Pedido de compra para ${row.supplierName} criado (R$ ${totalAmount.toFixed(2)}).` })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar pedido de compra.' })
  }
}

export async function approvePurchaseOrder(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduPurchaseOrder.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Pedido de compra não encontrado.' })
    if (existing.status !== 'RASCUNHO' && existing.status !== 'ENVIADO') return res.status(409).json({ error: 'Pedido não está em um status aprovável.' })

    const row = await prisma.eduPurchaseOrder.update({ where: { id }, data: { status: 'APROVADO', approvedById: actorId } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_PURCHASE_ORDER_APPROVE', entityType: 'EduPurchaseOrder', entityId: id, summary: `Pedido de compra de ${existing.supplierName} aprovado.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao aprovar pedido de compra.' })
  }
}

export async function receivePurchaseOrder(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduPurchaseOrder.findFirst({ where: { id, clinicId, tenantId }, include: { items: true } })
    if (!existing) return res.status(404).json({ error: 'Pedido de compra não encontrado.' })
    if (existing.status !== 'APROVADO') return res.status(409).json({ error: 'Só é possível receber pedidos aprovados.' })

    const financialEntry = await prisma.financialEntry.create({
      data: {
        clinicId, tenantId, type: 'EXPENSE', category: 'SUPRIMENTOS',
        description: `Compra — ${existing.supplierName}`, personName: existing.supplierName,
        amount: existing.totalAmount, dueDate: new Date(), status: 'PENDING',
        origin: 'EDU_PURCHASE', originId: existing.id
      }
    })

    await prisma.$transaction([
      ...existing.items.filter(item => item.itemId).map(item => prisma.eduSupplyMovement.create({
        data: { clinicId, tenantId, itemId: item.itemId!, type: 'ENTRADA', quantity: item.quantity, reason: `Recebimento do pedido ${existing.id}`, referenceType: 'EduPurchaseOrder', referenceId: existing.id, createdById: actorId }
      })),
      ...existing.items.filter(item => item.itemId).map(item => prisma.eduSupplyItem.update({
        where: { id: item.itemId! }, data: { currentQuantity: { increment: item.quantity } }
      })),
      prisma.eduPurchaseOrder.update({ where: { id }, data: { status: 'RECEBIDO', financialEntryId: financialEntry.id } })
    ])

    await audit({ clinicId, tenantId, actorId, action: 'EDU_PURCHASE_ORDER_RECEIVE', entityType: 'EduPurchaseOrder', entityId: id, summary: `Pedido de ${existing.supplierName} recebido; estoque e conta a pagar atualizados.` })
    return res.json({ status: 'RECEBIDO', financialEntryId: financialEntry.id })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao receber pedido de compra.' })
  }
}

// ---------------------------------------------------------------
// VENDAS — gera saída de estoque + conta a receber
// ---------------------------------------------------------------

export async function listSales(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.eduSale.findMany({ where: { clinicId, tenantId }, include: { items: true, student: true }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar vendas.' })
  }
}

export async function createSale(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const parsed = saleSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    if (parsed.data.studentId) {
      const student = await prisma.eduStudent.findFirst({ where: { id: parsed.data.studentId, clinicId, tenantId } })
      if (!student) return res.status(400).json({ error: 'Aluno inválido.' })
    }

    const itemIds = parsed.data.items.filter(item => item.itemId).map(item => item.itemId!)
    const stockItems = itemIds.length ? await prisma.eduSupplyItem.findMany({ where: { id: { in: itemIds }, clinicId, tenantId } }) : []
    const stockById = new Map(stockItems.map(item => [item.id, item]))
    for (const line of parsed.data.items) {
      if (!line.itemId) continue
      const stock = stockById.get(line.itemId)
      if (!stock) return res.status(400).json({ error: `Item de estoque inválido: ${line.description}.` })
      if (stock.currentQuantity < line.quantity) return res.status(409).json({ error: `Estoque insuficiente para "${stock.name}".` })
    }

    const totalAmount = parsed.data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

    const sale = await prisma.eduSale.create({
      data: {
        clinicId, tenantId, createdById: actorId, studentId: parsed.data.studentId, buyerName: parsed.data.buyerName,
        paymentMethod: parsed.data.paymentMethod, totalAmount, items: { create: parsed.data.items }
      },
      include: { items: true }
    })

    const financialEntry = await prisma.financialEntry.create({
      data: {
        clinicId, tenantId, type: 'INCOME', category: 'SUPRIMENTOS',
        description: `Venda — ${sale.buyerName}`, personName: sale.buyerName,
        amount: totalAmount, dueDate: new Date(), status: 'PENDING',
        origin: 'EDU_SALE', originId: sale.id
      }
    })

    await prisma.$transaction([
      prisma.eduSale.update({ where: { id: sale.id }, data: { financialEntryId: financialEntry.id } }),
      ...parsed.data.items.filter(item => item.itemId).map(item => prisma.eduSupplyMovement.create({
        data: { clinicId, tenantId, itemId: item.itemId!, type: 'SAIDA', quantity: -Math.abs(item.quantity), reason: `Venda ${sale.id}`, referenceType: 'EduSale', referenceId: sale.id, createdById: actorId }
      })),
      ...parsed.data.items.filter(item => item.itemId).map(item => prisma.eduSupplyItem.update({
        where: { id: item.itemId! }, data: { currentQuantity: { decrement: item.quantity } }
      }))
    ])

    await audit({ clinicId, tenantId, actorId, action: 'EDU_SALE_CREATE', entityType: 'EduSale', entityId: sale.id, summary: `Venda para ${sale.buyerName} registrada (R$ ${totalAmount.toFixed(2)}).` })
    return res.status(201).json({ ...sale, financialEntryId: financialEntry.id })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao registrar venda.' })
  }
}
