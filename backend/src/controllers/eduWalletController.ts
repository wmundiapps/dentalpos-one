import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { walletAdjustSchema, walletRechargeSchema } from '../validators/eduWalletValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

async function myStudent(req: AuthRequest) {
  const { clinicId, tenantId } = ctx(req)
  if (!req.user) return null
  return prisma.eduStudent.findFirst({ where: { clinicId, tenantId, userId: req.user.id } })
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

async function getOrCreateWallet(clinicId: string, tenantId: string, studentId: string) {
  const existing = await prisma.eduStudentWallet.findUnique({ where: { studentId } })
  if (existing) return existing
  return prisma.eduStudentWallet.create({ data: { clinicId, tenantId, studentId } })
}

// Usado também pelo módulo de Suprimentos (eduSupplyController.createSale)
// quando a venda é paga com paymentMethod "CREDITO_CANTINA": só movimenta o
// saldo já recarregado, sem gerar nova receita no Financeiro.
export async function debitWallet(input: {
  clinicId: string; tenantId: string; studentId: string; amount: number
  description: string; referenceType?: string; referenceId?: string; createdById: string
}): Promise<{ ok: true; transaction: Awaited<ReturnType<typeof prisma.eduWalletTransaction.create>> } | { ok: false; error: string }> {
  const wallet = await getOrCreateWallet(input.clinicId, input.tenantId, input.studentId)
  if (!wallet.isActive) return { ok: false, error: 'Carteira de créditos do aluno está inativa.' }
  const newBalance = Math.round((wallet.balance - input.amount) * 100) / 100
  if (newBalance < 0) return { ok: false, error: 'Saldo de créditos insuficiente para esta compra.' }

  const [, transaction] = await prisma.$transaction([
    prisma.eduStudentWallet.update({ where: { id: wallet.id }, data: { balance: newBalance } }),
    prisma.eduWalletTransaction.create({
      data: {
        clinicId: input.clinicId, tenantId: input.tenantId, walletId: wallet.id, type: 'DEBITO',
        amount: -Math.abs(input.amount), balanceAfter: newBalance, description: input.description,
        referenceType: input.referenceType, referenceId: input.referenceId, createdById: input.createdById
      }
    })
  ])
  return { ok: true, transaction }
}

// ---------------------------------------------------------------
// ADMINISTRATIVO
// ---------------------------------------------------------------

export async function getStudentWallet(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const studentId = String(req.params.studentId)
    const student = await prisma.eduStudent.findFirst({ where: { id: studentId, clinicId, tenantId } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const wallet = await getOrCreateWallet(clinicId, tenantId, studentId)
    const transactions = await prisma.eduWalletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 50 })
    return res.json({ ...wallet, transactions })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar carteira de créditos do aluno.' })
  }
}

export async function rechargeWallet(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const studentId = String(req.params.studentId)
    const student = await prisma.eduStudent.findFirst({ where: { id: studentId, clinicId, tenantId } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const parsed = walletRechargeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const wallet = await getOrCreateWallet(clinicId, tenantId, studentId)
    const newBalance = Math.round((wallet.balance + parsed.data.amount) * 100) / 100

    const financialEntry = await prisma.financialEntry.create({
      data: {
        clinicId, tenantId, type: 'INCOME', category: 'CANTINA_RECARGA',
        description: `Recarga de créditos — ${student.fullName}`, personName: student.fullName,
        amount: parsed.data.amount, dueDate: new Date(), status: 'PAID', paidAt: new Date(),
        origin: 'EDU_WALLET_RECHARGE', originId: wallet.id
      }
    })

    const [, transaction] = await prisma.$transaction([
      prisma.eduStudentWallet.update({ where: { id: wallet.id }, data: { balance: newBalance } }),
      prisma.eduWalletTransaction.create({
        data: {
          clinicId, tenantId, walletId: wallet.id, type: 'RECARGA', amount: parsed.data.amount, balanceAfter: newBalance,
          description: parsed.data.notes || `Recarga de créditos (R$ ${parsed.data.amount.toFixed(2)})`,
          referenceType: 'FinancialEntry', referenceId: financialEntry.id, createdById: actorId
        }
      })
    ])

    await audit({ clinicId, tenantId, actorId, action: 'EDU_WALLET_RECHARGE', entityType: 'EduStudentWallet', entityId: wallet.id, summary: `Recarga de R$ ${parsed.data.amount.toFixed(2)} na carteira de ${student.fullName}.` })
    return res.status(201).json({ walletId: wallet.id, balance: newBalance, transaction, financialEntryId: financialEntry.id })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao recarregar carteira de créditos.' })
  }
}

export async function adjustWallet(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const studentId = String(req.params.studentId)
    const student = await prisma.eduStudent.findFirst({ where: { id: studentId, clinicId, tenantId } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado.' })

    const parsed = walletAdjustSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const wallet = await getOrCreateWallet(clinicId, tenantId, studentId)
    const newBalance = Math.round((wallet.balance + parsed.data.amount) * 100) / 100
    if (newBalance < 0) return res.status(409).json({ error: 'Ajuste resultaria em saldo negativo.' })

    const [, transaction] = await prisma.$transaction([
      prisma.eduStudentWallet.update({ where: { id: wallet.id }, data: { balance: newBalance } }),
      prisma.eduWalletTransaction.create({
        data: { clinicId, tenantId, walletId: wallet.id, type: 'AJUSTE', amount: parsed.data.amount, balanceAfter: newBalance, description: parsed.data.notes, createdById: actorId }
      })
    ])

    await audit({ clinicId, tenantId, actorId, action: 'EDU_WALLET_ADJUST', entityType: 'EduStudentWallet', entityId: wallet.id, summary: `Ajuste manual de R$ ${parsed.data.amount.toFixed(2)} na carteira de ${student.fullName}: ${parsed.data.notes}` })
    return res.json({ walletId: wallet.id, balance: newBalance, transaction })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao ajustar carteira de créditos.' })
  }
}

// ---------------------------------------------------------------
// PORTAL DO ALUNO (self-service)
// ---------------------------------------------------------------

export async function myWallet(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })

    const wallet = await getOrCreateWallet(clinicId, tenantId, student.id)
    const transactions = await prisma.eduWalletTransaction.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 50 })
    return res.json({ ...wallet, transactions })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar minha carteira de créditos.' })
  }
}
