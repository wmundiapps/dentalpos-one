import type { Response } from 'express'
import { prisma } from '../lib/prisma'
import type { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function context(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function idParam(req: AuthRequest): string {
  const value = req.params.id
  return Array.isArray(value) ? value[0] : String(value)
}

function dateValue(value: unknown): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const defaultAccounts = [
  ['1.1.01', 'Caixa', 'ATIVO'],
  ['1.1.02', 'Bancos', 'ATIVO'],
  ['1.1.03', 'Contas a receber', 'ATIVO'],
  ['2.1.01', 'Fornecedores a pagar', 'PASSIVO'],
  ['2.1.02', 'Obrigações trabalhistas', 'PASSIVO'],
  ['2.1.03', 'Obrigações tributárias', 'PASSIVO'],
  ['3.1.01', 'Receitas de serviços odontológicos', 'RECEITA'],
  ['3.1.02', 'Receitas de cursos', 'RECEITA'],
  ['3.1.03', 'Receitas comerciais', 'RECEITA'],
  ['4.1.01', 'Materiais odontológicos', 'DESPESA'],
  ['4.1.02', 'Laboratório e prótese', 'DESPESA'],
  ['4.1.03', 'Folha de pagamento', 'DESPESA'],
  ['4.1.04', 'Encargos trabalhistas', 'DESPESA'],
  ['4.1.05', 'Marketing e vendas', 'DESPESA'],
  ['4.1.06', 'Despesas administrativas', 'DESPESA'],
  ['4.1.07', 'Tributos', 'DESPESA'],
] as const

const defaultCostCenters = [
  ['ADM', 'Administrativo', 'Administrativo'],
  ['CLI', 'Clínica', 'Clínico'],
  ['COM', 'Comercial', 'Comercial'],
  ['LAB', 'Laboratório', 'Laboratório'],
  ['MKT', 'Marketing', 'Marketing'],
  ['RH', 'Recursos Humanos', 'RH'],
] as const

export async function dashboard(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

    const [entries, taxes, payroll, suppliers, accountants] = await Promise.all([
      prisma.financialEntry.findMany({ where: { clinicId, tenantId, status: { not: 'CANCELLED' } } }),
      prisma.taxObligation.findMany({ where: { clinicId, tenantId } }),
      prisma.hRPayrollClosing.findMany({ where: { clinicId, tenantId }, orderBy: { createdAt: 'desc' }, take: 6 }),
      prisma.supplier.count({ where: { clinicId, tenantId, isActive: true } }),
      prisma.accountantPortalAccess.count({ where: { clinicId, tenantId, status: 'ACTIVE' } }),
    ])

    const sum = (rows: typeof entries) => rows.reduce((total, row) => total + Number(row.amount), 0)
    const openReceivables = entries.filter((row) => row.type === 'INCOME' && row.status !== 'PAID')
    const openPayables = entries.filter((row) => row.type === 'EXPENSE' && row.status !== 'PAID')
    const receivedThisMonth = entries.filter((row) => row.type === 'INCOME' && row.status === 'PAID' && row.paidAt && row.paidAt >= monthStart && row.paidAt < monthEnd)
    const paidThisMonth = entries.filter((row) => row.type === 'EXPENSE' && row.status === 'PAID' && row.paidAt && row.paidAt >= monthStart && row.paidAt < monthEnd)
    const overdue = entries.filter((row) => row.status !== 'PAID' && row.dueDate < now)
    const pendingAccounting = entries.filter((row) => row.accountingStatus !== 'REVIEWED' && row.status !== 'CANCELLED')
    const taxPending = taxes.filter((row) => !['PAID', 'TRANSMITTED'].includes(row.status))

    return res.json({
      receivable: sum(openReceivables),
      payable: sum(openPayables),
      receivedThisMonth: sum(receivedThisMonth),
      paidThisMonth: sum(paidThisMonth),
      cashResultThisMonth: sum(receivedThisMonth) - sum(paidThisMonth),
      overdueCount: overdue.length,
      overdueValue: sum(overdue),
      accountingPending: pendingAccounting.length,
      taxPending: taxPending.length,
      taxPendingValue: taxPending.reduce((total, row) => total + Number(row.finalValue ?? row.estimatedValue), 0),
      suppliers,
      activeAccountants: accountants,
      payroll: payroll.map((row) => ({
        id: row.id,
        reference: row.reference,
        netPayroll: Number(row.netPayroll),
        employerCharges: Number(row.employerCharges),
        status: row.status,
        paymentDate: row.paymentDate,
      })),
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao montar painel integrado do backoffice.' })
  }
}

export async function dre(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const from = dateValue(req.query.from)
    const to = dateValue(req.query.to)
    const rows = await prisma.financialEntry.findMany({
      where: {
        clinicId,
        tenantId,
        status: { not: 'CANCELLED' },
        ...(from || to ? { competenceDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      orderBy: { competenceDate: 'asc' },
    })
    const grouped = new Map<string, { category: string; type: string; amount: number }>()
    for (const row of rows) {
      const key = `${row.type}:${row.category}`
      const current = grouped.get(key) || { category: row.category, type: row.type, amount: 0 }
      current.amount += Number(row.netAmount ?? row.amount)
      grouped.set(key, current)
    }
    const revenue = rows.filter((row) => row.type === 'INCOME').reduce((total, row) => total + Number(row.netAmount ?? row.amount), 0)
    const expense = rows.filter((row) => row.type === 'EXPENSE').reduce((total, row) => total + Number(row.netAmount ?? row.amount), 0)
    return res.json({ revenue, expense, result: revenue - expense, lines: [...grouped.values()] })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao gerar DRE.' })
  }
}

export async function suppliers(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = context(req)
  return res.json(await prisma.supplier.findMany({ where: { clinicId, tenantId }, orderBy: { name: 'asc' } }))
}

export async function createSupplier(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req)
    const body = req.body
    if (!body.name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório.' })
    const row = await prisma.supplier.create({
      data: {
        clinicId,
        tenantId,
        name: String(body.name),
        tradeName: body.tradeName ? String(body.tradeName) : null,
        document: body.document ? String(body.document) : null,
        email: body.email ? String(body.email) : null,
        phone: body.phone ? String(body.phone) : null,
        pixKey: body.pixKey ? String(body.pixKey) : null,
        bankData: body.bankData ? String(body.bankData) : null,
        category: String(body.category || 'GERAL'),
        paymentTerms: body.paymentTerms ? String(body.paymentTerms) : null,
        notes: body.notes ? String(body.notes) : null,
      },
    })
    await writeAudit({ clinicId, tenantId, actorId, module: 'accounting', action: 'SUPPLIER_CREATE', entityType: 'Supplier', entityId: row.id, afterData: row })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cadastrar fornecedor.' })
  }
}

export async function accounts(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = context(req)
  return res.json(await prisma.accountingAccount.findMany({ where: { clinicId, tenantId }, orderBy: { code: 'asc' } }))
}

export async function bootstrapAccounts(req: AuthRequest, res: Response) {
  const { clinicId, tenantId, actorId } = context(req)
  for (const [code, name, group] of defaultAccounts) {
    await prisma.accountingAccount.upsert({
      where: { clinicId_code: { clinicId, code } },
      update: { name, group, isActive: true },
      create: { clinicId, tenantId, code, name, group },
    })
  }
  await writeAudit({ clinicId, tenantId, actorId, module: 'accounting', action: 'CHART_BOOTSTRAP', summary: 'Plano de contas padrão criado/atualizado.' })
  return res.json({ ok: true, count: defaultAccounts.length })
}

export async function costCenters(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = context(req)
  return res.json(await prisma.costCenter.findMany({ where: { clinicId, tenantId }, orderBy: { code: 'asc' } }))
}

export async function bootstrapCostCenters(req: AuthRequest, res: Response) {
  const { clinicId, tenantId, actorId } = context(req)
  for (const [code, name, department] of defaultCostCenters) {
    await prisma.costCenter.upsert({
      where: { clinicId_code: { clinicId, code } },
      update: { name, department, isActive: true },
      create: { clinicId, tenantId, code, name, department },
    })
  }
  await writeAudit({ clinicId, tenantId, actorId, module: 'accounting', action: 'COST_CENTER_BOOTSTRAP', summary: 'Centros de custo padrão criados/atualizados.' })
  return res.json({ ok: true, count: defaultCostCenters.length })
}

export async function taxObligations(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = context(req)
  return res.json(await prisma.taxObligation.findMany({ where: { clinicId, tenantId }, include: { financialEntry: true }, orderBy: { dueDate: 'asc' } }))
}

export async function createTaxObligation(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req)
    const body = req.body
    const dueDate = dateValue(body.dueDate)
    if (!body.name || !body.entityName || !body.competence || !dueDate) return res.status(400).json({ error: 'Obrigação, entidade, competência e vencimento são obrigatórios.' })
    const row = await prisma.taxObligation.create({
      data: {
        clinicId,
        tenantId,
        name: String(body.name),
        entityName: String(body.entityName),
        legalEntity: String(body.legalEntity || 'PJ'),
        regime: body.regime ? String(body.regime) : null,
        competence: String(body.competence),
        dueDate,
        estimatedValue: Number(body.estimatedValue || 0),
        finalValue: body.finalValue !== undefined && body.finalValue !== null ? Number(body.finalValue) : null,
        status: String(body.status || 'TO_CALCULATE'),
        responsible: body.responsible ? String(body.responsible) : null,
        requiresAccountantApproval: body.requiresAccountantApproval !== false,
        notes: body.notes ? String(body.notes) : null,
      },
    })
    await writeAudit({ clinicId, tenantId, actorId, module: 'accounting', action: 'TAX_CREATE', entityType: 'TaxObligation', entityId: row.id, afterData: row })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao criar obrigação fiscal.' })
  }
}

export async function approveTaxObligation(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req)
    const id = idParam(req)
    const obligation = await prisma.taxObligation.findFirst({ where: { id, clinicId, tenantId } })
    if (!obligation) return res.status(404).json({ error: 'Obrigação fiscal não encontrada.' })
    const amount = Number(req.body.finalValue ?? obligation.finalValue ?? obligation.estimatedValue)
    if (amount <= 0) return res.status(400).json({ error: 'Informe o valor final antes de aprovar.' })

    const result = await prisma.$transaction(async (tx) => {
      let financialEntryId = obligation.financialEntryId
      if (!financialEntryId) {
        const entry = await tx.financialEntry.create({
          data: {
            clinicId,
            tenantId,
            type: 'EXPENSE',
            description: `${obligation.name} • ${obligation.competence}`,
            category: 'TRIBUTOS',
            personName: obligation.entityName,
            amount,
            netAmount: amount,
            dueDate: obligation.dueDate,
            competenceDate: obligation.dueDate,
            status: 'PENDING',
            origin: 'TAX',
            originId: obligation.id,
            accountingMode: 'FISCAL',
            accountingStatus: 'REVIEWED',
            approvedAt: new Date(),
          },
        })
        financialEntryId = entry.id
      } else {
        await tx.financialEntry.update({ where: { id: financialEntryId }, data: { amount, netAmount: amount, dueDate: obligation.dueDate, status: 'PENDING', approvedAt: new Date() } })
      }
      return tx.taxObligation.update({
        where: { id: obligation.id },
        data: {
          finalValue: amount,
          status: 'APPROVED',
          approvedBy: actorId,
          approvedAt: new Date(),
          financialEntryId,
        },
        include: { financialEntry: true },
      })
    })

    await writeAudit({ clinicId, tenantId, actorId, module: 'accounting', action: 'TAX_APPROVE', entityType: 'TaxObligation', entityId: id, afterData: result, summary: 'Obrigação fiscal aprovada e enviada ao contas a pagar.' })
    return res.json(result)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao aprovar obrigação fiscal.' })
  }
}

export async function accountantAccesses(req: AuthRequest, res: Response) {
  const { clinicId, tenantId } = context(req)
  return res.json(await prisma.accountantPortalAccess.findMany({ where: { clinicId, tenantId }, orderBy: { name: 'asc' } }))
}

export async function createAccountantAccess(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req)
    const body = req.body
    if (!body.name || !body.email) return res.status(400).json({ error: 'Nome e e-mail do contador são obrigatórios.' })
    const row = await prisma.accountantPortalAccess.upsert({
      where: { clinicId_email: { clinicId, email: String(body.email).toLowerCase() } },
      update: {
        name: String(body.name),
        status: String(body.status || 'ACTIVE'),
        canViewFinance: body.canViewFinance !== false,
        canViewTax: body.canViewTax !== false,
        canViewPayroll: Boolean(body.canViewPayroll),
        canExport: body.canExport !== false,
        canApproveTax: Boolean(body.canApproveTax),
      },
      create: {
        clinicId,
        tenantId,
        name: String(body.name),
        email: String(body.email).toLowerCase(),
        status: String(body.status || 'INVITED'),
        canViewFinance: body.canViewFinance !== false,
        canViewTax: body.canViewTax !== false,
        canViewPayroll: Boolean(body.canViewPayroll),
        canExport: body.canExport !== false,
        canApproveTax: Boolean(body.canApproveTax),
      },
    })
    await writeAudit({ clinicId, tenantId, actorId, module: 'accounting', action: 'ACCOUNTANT_ACCESS_SAVE', entityType: 'AccountantPortalAccess', entityId: row.id, afterData: row })
    return res.status(201).json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao configurar acesso do contador.' })
  }
}

export async function updateAccountantAccess(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req)
    const id = idParam(req)
    const before = await prisma.accountantPortalAccess.findFirst({ where: { id, clinicId, tenantId } })
    if (!before) return res.status(404).json({ error: 'Acesso do contador não encontrado.' })
    const body = req.body
    const row = await prisma.accountantPortalAccess.update({
      where: { id: before.id },
      data: {
        status: body.status,
        canViewFinance: body.canViewFinance,
        canViewTax: body.canViewTax,
        canViewPayroll: body.canViewPayroll,
        canExport: body.canExport,
        canApproveTax: body.canApproveTax,
      },
    })
    await writeAudit({ clinicId, tenantId, actorId, module: 'accounting', action: 'ACCOUNTANT_ACCESS_UPDATE', entityType: 'AccountantPortalAccess', entityId: row.id, beforeData: before, afterData: row })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao atualizar acesso do contador.' })
  }
}
