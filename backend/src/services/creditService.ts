import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'

export type CreditKind = 'IA' | 'SMS' | 'VOZ'

// Saldo e franquia por clinica. A franquia vem de PlanAllowance (ajustavel por SQL,
// sem mexer em codigo) e renova no primeiro uso de cada mes. Nao acumula.

function firstDayOfMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

async function planOf(clinicId: string) {
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { plan: true } })
  const plan = String(clinic?.plan || '').toUpperCase()
  return plan.startsWith('DEMO') ? 'DEMO' : plan || 'DEMO'
}

export async function getWallet(clinicId: string, tenantId: string, kind: CreditKind) {
  const plan = await planOf(clinicId)
  const allowance = await prisma.planAllowance.findUnique({ where: { plan_kind: { plan, kind } } })
  const monthlyFree = Number(allowance?.monthlyFree || 0)
  const inicioMes = firstDayOfMonth()

  let wallet = await prisma.creditWallet.findUnique({ where: { clinicId_kind: { clinicId, kind } } })
  if (!wallet) {
    wallet = await prisma.creditWallet.create({
      data: { id: randomUUID(), clinicId, tenantId, kind, freeAllowance: monthlyFree, freeUsed: 0, freeResetAt: inicioMes },
    })
    return { wallet, plan, maxPerTask: allowance?.maxPerTask ?? null }
  }

  const precisaRenovar = !wallet.freeResetAt || wallet.freeResetAt < inicioMes
  const mudouFranquia = Number(wallet.freeAllowance) !== monthlyFree
  if (precisaRenovar || mudouFranquia) {
    wallet = await prisma.creditWallet.update({
      where: { id: wallet.id },
      data: {
        freeAllowance: monthlyFree,
        ...(precisaRenovar ? { freeUsed: 0, freeResetAt: inicioMes } : {}),
        updatedAt: new Date(),
      },
    })
  }
  return { wallet, plan, maxPerTask: allowance?.maxPerTask ?? null }
}

export async function checkBalance(clinicId: string, tenantId: string, kind: CreditKind, units = 1) {
  const { wallet, plan, maxPerTask } = await getWallet(clinicId, tenantId, kind)
  if (wallet.status !== 'ATIVA') {
    return { allowed: false as const, reason: 'CARTEIRA_SUSPENSA', wallet, plan, maxPerTask }
  }
  const franquiaRestante = Math.max(0, Number(wallet.freeAllowance) - Number(wallet.freeUsed))
  const disponivel = franquiaRestante + Number(wallet.balance)
  if (disponivel < units) {
    return { allowed: false as const, reason: 'SEM_SALDO', wallet, plan, maxPerTask, franquiaRestante }
  }
  return { allowed: true as const, wallet, plan, maxPerTask, franquiaRestante }
}

// Debita: consome a franquia primeiro, depois o saldo comprado. Registra no extrato.
export async function debit(input: {
  clinicId: string
  tenantId: string
  kind: CreditKind
  units: number
  description: string
  providerCost?: number
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  referenceType?: string
  referenceId?: string
  actorId?: string
  idempotencyKey?: string
}) {
  const { clinicId, tenantId, kind } = input
  const units = Math.max(0, Number(input.units || 0))

  if (input.idempotencyKey) {
    const ja = await prisma.creditLedger.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (ja) return { ok: true as const, repetido: true, ledgerId: ja.id }
  }

  const { wallet } = await getWallet(clinicId, tenantId, kind)
  const franquiaRestante = Math.max(0, Number(wallet.freeAllowance) - Number(wallet.freeUsed))
  const daFranquia = Math.min(franquiaRestante, units)
  const doSaldo = units - daFranquia

  if (doSaldo > Number(wallet.balance)) {
    return { ok: false as const, reason: 'SEM_SALDO' }
  }

  const atualizada = await prisma.creditWallet.update({
    where: { id: wallet.id },
    data: {
      freeUsed: { increment: daFranquia },
      balance: { decrement: doSaldo },
      updatedAt: new Date(),
    },
  })

  const ledger = await prisma.creditLedger.create({
    data: {
      id: randomUUID(),
      walletId: wallet.id,
      clinicId,
      tenantId,
      kind,
      movement: daFranquia >= units ? 'FRANQUIA' : 'CONSUMO',
      amount: -units,
      balanceAfter: Number(atualizada.balance),
      description: input.description,
      providerCost: input.providerCost ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actorId: input.actorId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  })

  return { ok: true as const, repetido: false, ledgerId: ledger.id, daFranquia, doSaldo }
}

// Credita apos compra paga. Tambem serve para estorno e ajuste manual.
export async function credit(input: {
  clinicId: string
  tenantId: string
  kind: CreditKind
  units: number
  description: string
  movement?: 'COMPRA' | 'ESTORNO' | 'AJUSTE'
  referenceType?: string
  referenceId?: string
  actorId?: string
  idempotencyKey?: string
}) {
  const { clinicId, tenantId, kind } = input
  const units = Math.max(0, Number(input.units || 0))

  if (input.idempotencyKey) {
    const ja = await prisma.creditLedger.findFirst({ where: { idempotencyKey: input.idempotencyKey } })
    if (ja) return { ok: true as const, repetido: true, ledgerId: ja.id }
  }

  const { wallet } = await getWallet(clinicId, tenantId, kind)
  const atualizada = await prisma.creditWallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: units }, updatedAt: new Date() },
  })

  const ledger = await prisma.creditLedger.create({
    data: {
      id: randomUUID(),
      walletId: wallet.id,
      clinicId,
      tenantId,
      kind,
      movement: input.movement || 'COMPRA',
      amount: units,
      balanceAfter: Number(atualizada.balance),
      description: input.description,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actorId: input.actorId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  })

  return { ok: true as const, repetido: false, ledgerId: ledger.id, saldo: Number(atualizada.balance) }
}