import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { closeCycle, normKey, productHistory, stockAlerts } from '../services/stockUsageService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

export async function rules(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const rows = await prisma.stockProcedureRule.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: [{ procedureLabel: 'asc' }] })
    const products = await prisma.salesProduct.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.productId))] } }, select: { id: true, sku: true, name: true } })
    const byId = new Map(products.map((p) => [p.id, p]))
    return res.json(rows.map((r) => ({ ...r, productName: byId.get(r.productId)?.name || '', productSku: byId.get(r.productId)?.sku || '' })))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar o consumo por procedimento.' })
  }
}

const text = (v: unknown) => String(v ?? '').trim()
const num = (v: unknown) => { const n = Number(text(v).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }

// Planilha: Procedimento, Produto (código ou nome), Quantidade, Modo (baixa ou contagem) e Por dente (sim/não).
export async function importRules(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const rows: Array<Record<string, unknown>> = Array.isArray(req.body?.rows) ? req.body.rows : []
    if (!rows.length) return res.status(400).json({ error: 'Nenhuma linha para importar.' })
    if (rows.length > 3000) return res.status(400).json({ error: 'Máximo de 3000 linhas por envio.' })
    const products = await prisma.salesProduct.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId } })
    const bySku = new Map(products.map((p) => [normKey(p.sku), p]))
    const byName = new Map(products.map((p) => [normKey(p.name), p]))
    const skipped: Array<{ row: number; reason: string }> = []
    let createdCount = 0, updatedCount = 0
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {}
      const procedure = text(r.procedure), productRef = text(r.product)
      if (!procedure) { skipped.push({ row: i + 1, reason: 'Informe o procedimento.' }); continue }
      const product = bySku.get(normKey(productRef)) || byName.get(normKey(productRef))
      if (!product) { skipped.push({ row: i + 1, reason: `Produto "${productRef}" não encontrado no estoque. Cadastre o item antes.` }); continue }
      const quantity = num(r.quantity) ?? 1
      const mode = /cont|uso|dura/.test(normKey(r.mode)) ? 'COUNT' : 'DEBIT'
      const perTooth = /^(s|sim|x|1|true|por dente|dente)$/.test(normKey(r.perTooth))
      const procedureKey = normKey(procedure)
      const key = { clinicId_procedureKey_productId: { clinicId: c.clinicId, procedureKey, productId: product.id } }
      const existing = await prisma.stockProcedureRule.findUnique({ where: key })
      await prisma.stockProcedureRule.upsert({
        where: key,
        update: { procedureLabel: procedure, mode, quantity, perTooth },
        create: { clinicId: c.clinicId, tenantId: c.tenantId, procedureKey, procedureLabel: procedure, productId: product.id, mode, quantity, perTooth },
      })
      if (existing) updatedCount++; else createdCount++
    }
    await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'stock', action: 'STOCK_RULES_IMPORT', entityType: 'StockProcedureRule', entityId: 'bulk', summary: `Consumo por procedimento: ${createdCount} novo(s), ${updatedCount} atualizado(s), ${skipped.length} ignorado(s).` }).catch((e: unknown) => console.error(e))
    return res.status(201).json({ createdCount, updatedCount, skipped })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao importar o consumo por procedimento.' })
  }
}

export async function removeRule(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const done = await prisma.stockProcedureRule.deleteMany({ where: { id: String(req.params.id), clinicId: c.clinicId, tenantId: c.tenantId } })
    if (!done.count) return res.status(404).json({ error: 'Regra não encontrada.' })
    return res.json({ ok: true })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao remover a regra.' })
  }
}

export async function history(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const productId = String(req.params.productId)
    const product = await prisma.salesProduct.findFirst({ where: { id: productId, clinicId: c.clinicId, tenantId: c.tenantId }, select: { id: true } })
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' })
    return res.json(await productHistory(c, productId))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar o histórico do produto.' })
  }
}

// Reposição (entra quantidade) ou "terminou uma unidade" (sai 1, ex.: acabou a bisnaga). Os dois fecham o ciclo de uso.
export async function movement(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req)
    const productId = String(req.params.productId)
    const type = req.body?.type === 'UNIT_USED' ? 'UNIT_USED' : 'RESTOCK'
    const quantity = num(req.body?.quantity) ?? 1
    const product = await prisma.salesProduct.findFirst({ where: { id: productId, clinicId: c.clinicId, tenantId: c.tenantId } })
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' })
    // O resumo do ciclo que termina é devolvido para aparecer na hora do pedido.
    const before = await productHistory(c, productId)
    const cycle = await closeCycle(c, productId, type)
    if (type === 'RESTOCK') await prisma.salesProduct.update({ where: { id: productId }, data: { stockQuantity: { increment: quantity } } })
    else {
      const done = await prisma.salesProduct.updateMany({ where: { id: productId, stockQuantity: { gte: quantity } }, data: { stockQuantity: { decrement: quantity } } })
      if (!done.count) await prisma.salesProduct.update({ where: { id: productId }, data: { stockQuantity: 0 } })
    }
    const updated = await prisma.salesProduct.findUnique({ where: { id: productId } })
    await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'stock', action: type === 'RESTOCK' ? 'STOCK_RESTOCK' : 'STOCK_UNIT_USED', entityType: 'SalesProduct', entityId: productId, summary: `${product.name}: ${type === 'RESTOCK' ? `reposição de ${quantity}` : `terminou ${quantity} unidade(s)`}.` }).catch((e: unknown) => console.error(e))
    return res.json({ product: updated, cycle, average: before.average, procedureCount: cycle?.procedureCount ?? before.openCount })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao registrar a movimentação do estoque.' })
  }
}

export async function alerts(req: AuthRequest, res: Response) {
  try {
    return res.json(await stockAlerts(ctx(req)))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao consultar os avisos de estoque.' })
  }
}
