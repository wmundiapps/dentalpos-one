import { prisma } from '../lib/prisma'

// Consumo de estoque por procedimento.
// - DEBIT: cada procedimento baixa a quantidade do cadastro (ex.: 1 implante).
// - COUNT: o procedimento só conta o uso (ex.: uma bisnaga serve para várias restaurações); a unidade é baixada à mão.
// O histórico de cada reposição guarda quantos procedimentos o produto durou, para estimar a próxima.
type Ctx = { clinicId: string; tenantId: string }

export const normKey = (v: unknown) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// Registra o consumo de um procedimento executado. Nunca impede o registro da evolução.
export async function consumeForProcedure(c: Ctx, input: { evolutionId: string; patientId?: string | null; procedure: string; teethCount?: number }) {
  try {
    const key = normKey(input.procedure)
    if (!key) return
    const rules = await prisma.stockProcedureRule.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId } })
    const matched = rules.filter((r) => r.procedureKey === key || (r.procedureKey.length >= 4 && key.includes(r.procedureKey)))
    for (const rule of matched) {
      const qty = rule.quantity * (rule.perTooth ? Math.max(1, input.teethCount || 1) : 1)
      try {
        await prisma.stockUsageEvent.create({ data: { clinicId: c.clinicId, tenantId: c.tenantId, productId: rule.productId, procedureLabel: input.procedure, evolutionId: input.evolutionId, patientId: input.patientId || null, mode: rule.mode, quantity: qty } })
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') continue // este procedimento já foi contado para este produto
        throw e
      }
      if (rule.mode === 'DEBIT') {
        const done = await prisma.salesProduct.updateMany({ where: { id: rule.productId, clinicId: c.clinicId, stockQuantity: { gte: qty } }, data: { stockQuantity: { decrement: qty } } })
        if (done.count === 0) await prisma.salesProduct.updateMany({ where: { id: rule.productId, clinicId: c.clinicId }, data: { stockQuantity: 0 } })
      }
    }
  } catch (error) {
    console.error('Erro ao dar baixa de estoque pelo procedimento:', error)
  }
}

// Fecha o ciclo do produto: junta os usos ainda abertos e guarda quantos procedimentos ele durou.
export async function closeCycle(c: Ctx, productId: string, reason: 'RESTOCK' | 'UNIT_USED') {
  const open = await prisma.stockUsageEvent.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId, productId, cycleId: null }, orderBy: { createdAt: 'asc' } })
  if (!open.length) return null
  const last = await prisma.stockCycle.findFirst({ where: { clinicId: c.clinicId, productId }, orderBy: { endedAt: 'desc' } })
  const cycle = await prisma.stockCycle.create({
    data: { clinicId: c.clinicId, tenantId: c.tenantId, productId, startedAt: last?.endedAt || open[0].createdAt, endedAt: new Date(), procedureCount: open.length, unitsDebited: open.filter((e) => e.mode === 'DEBIT').reduce((s, e) => s + e.quantity, 0), reason },
  })
  await prisma.stockUsageEvent.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { cycleId: cycle.id } })
  return cycle
}

export async function productHistory(c: Ctx, productId: string) {
  const [cycles, openCount] = await Promise.all([
    prisma.stockCycle.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId, productId }, orderBy: { endedAt: 'desc' }, take: 12 }),
    prisma.stockUsageEvent.count({ where: { clinicId: c.clinicId, tenantId: c.tenantId, productId, cycleId: null } }),
  ])
  const counts = cycles.map((x) => x.procedureCount)
  const average = counts.length ? Math.round((counts.reduce((s, n) => s + n, 0) / counts.length) * 10) / 10 : null
  return { cycles, openCount, average }
}

export type StockAlert = { productId: string; sku: string; name: string; quantity: number; minimum: number; level: 'critical' | 'low' | 'predicted'; message: string }

// Itens acabando: abaixo do mínimo ou perto do fim pela média de procedimentos das reposições anteriores.
export async function stockAlerts(c: Ctx): Promise<StockAlert[]> {
  const products = await prisma.salesProduct.findMany({ where: { clinicId: c.clinicId, tenantId: c.tenantId, active: true } })
  const out: StockAlert[] = []
  for (const p of products) {
    const quantity = Number(p.stockQuantity), minimum = Number(p.minStock)
    const base = { productId: p.id, sku: p.sku, name: p.name, quantity, minimum }
    if (quantity <= 0 || quantity <= Math.max(1, Math.floor(minimum * 0.35))) { out.push({ ...base, level: 'critical', message: quantity <= 0 ? 'Acabou. Faça o pedido.' : `Acabando: restam ${quantity} (mínimo ${minimum}).` }); continue }
    if (quantity <= minimum) { out.push({ ...base, level: 'low', message: `Estoque baixo: restam ${quantity} (mínimo ${minimum}).` }); continue }
    const h = await productHistory(c, p.id)
    if (h.average && h.average >= 3 && h.openCount >= h.average * 0.8) {
      out.push({ ...base, level: 'predicted', message: `Já foram ${h.openCount} procedimentos desde a última reposição (a média é ${h.average}). Deve acabar em breve.` })
    }
  }
  return out
}
