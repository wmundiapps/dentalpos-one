import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function context(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = context(req)
    const rows = await prisma.financialEntry.findMany({ where: { clinicId, tenantId }, include: { patient: true }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }] })
    return res.json(rows)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao listar lançamentos financeiros.' }) }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req)
    const b = req.body
    if (!b.description || !b.personName || !b.amount || !b.dueDate || !b.type) return res.status(400).json({ error: 'Descrição, pessoa, valor, vencimento e tipo são obrigatórios.' })
    const row = await prisma.financialEntry.create({ data: { clinicId, tenantId, patientId: b.patientId || null, type: String(b.type), description: String(b.description), category: String(b.category || 'GERAL'), personName: String(b.personName), amount: Number(b.amount), dueDate: new Date(b.dueDate), competenceDate: b.competenceDate ? new Date(b.competenceDate) : null, status: String(b.status || 'PENDING'), paymentMethod: b.paymentMethod ? String(b.paymentMethod) : null, provider: b.provider ? String(b.provider) : null, origin: String(b.origin || 'MANUAL'), originId: b.originId ? String(b.originId) : null, installment: b.installment ? Number(b.installment) : null, installments: b.installments ? Number(b.installments) : null, notes: b.notes ? String(b.notes) : null, supplierId: b.supplierId || null, accountingAccountId: b.accountingAccountId || null, costCenterId: b.costCenterId || null, documentNumber: b.documentNumber ? String(b.documentNumber) : null, fiscalDocumentType: b.fiscalDocumentType ? String(b.fiscalDocumentType) : null, taxWithheld: Number(b.taxWithheld || 0), netAmount: b.netAmount !== undefined && b.netAmount !== null ? Number(b.netAmount) : Number(b.amount), accountingStatus: String(b.accountingStatus || 'PENDING'), accountantNotes: b.accountantNotes ? String(b.accountantNotes) : null, recurrence: b.recurrence ? String(b.recurrence) : null } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'FINANCIAL_ENTRY_CREATE', entityType: 'FinancialEntry', entityId: row.id, afterData: row, summary: `${row.type}: ${row.description}` })
    return res.status(201).json(row)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao criar lançamento financeiro.' }) }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req); const id = String(req.params.id)
    const existing = await prisma.financialEntry.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Lançamento não encontrado.' })
    const b = req.body; const data: any = {}
    for (const key of ['type','description','category','personName','status','paymentMethod','provider','origin','originId','notes','externalId','documentNumber','fiscalDocumentType','accountingStatus','accountantNotes','recurrence']) if (b[key] !== undefined) data[key] = b[key]
    for (const key of ['amount','taxWithheld','netAmount']) if (b[key] !== undefined) data[key] = b[key] == null ? null : Number(b[key])
    for (const key of ['installment','installments']) if (b[key] !== undefined) data[key] = b[key] == null ? null : Number(b[key])
    if (b.patientId !== undefined) data.patientId = b.patientId || null
    if (b.supplierId !== undefined) data.supplierId = b.supplierId || null
    if (b.accountingAccountId !== undefined) data.accountingAccountId = b.accountingAccountId || null
    if (b.costCenterId !== undefined) data.costCenterId = b.costCenterId || null
    if (b.dueDate !== undefined) data.dueDate = new Date(b.dueDate)
    if (b.competenceDate !== undefined) data.competenceDate = b.competenceDate ? new Date(b.competenceDate) : null
    if (b.paidAt !== undefined) data.paidAt = b.paidAt ? new Date(b.paidAt) : null
    const row = await prisma.financialEntry.update({ where: { id }, data })
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'FINANCIAL_ENTRY_UPDATE', entityType: 'FinancialEntry', entityId: id, beforeData: existing, afterData: row, summary: `Lançamento ${row.description} atualizado.` })
    return res.json(row)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao atualizar lançamento.' }) }
}

export async function settle(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req); const id = String(req.params.id)
    const existing = await prisma.financialEntry.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Lançamento não encontrado.' })
    const row = await prisma.financialEntry.update({ where: { id }, data: { status: 'PAID', paidAt: new Date() } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'FINANCIAL_ENTRY_SETTLE', entityType: 'FinancialEntry', entityId: id, beforeData: existing, afterData: row, summary: `Baixa financeira: ${row.description}` })
    return res.json(row)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao baixar lançamento.' }) }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = context(req); const id = String(req.params.id)
    const existing = await prisma.financialEntry.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Lançamento não encontrado.' })
    const row = await prisma.financialEntry.update({ where: { id }, data: { status: 'CANCELLED' } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'finance', action: 'FINANCIAL_ENTRY_CANCEL', entityType: 'FinancialEntry', entityId: id, beforeData: existing, afterData: row, summary: `Lançamento cancelado: ${row.description}` })
    return res.json(row)
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao cancelar lançamento.' }) }
}


export async function dashboard(req:AuthRequest,res:Response){
  try{const {clinicId,tenantId}=context(req);const rows=await prisma.financialEntry.findMany({where:{clinicId,tenantId,status:{not:'CANCELLED'}}});const now=new Date();const today=now.toISOString().slice(0,10);const income=rows.filter(x=>x.type==='INCOME');const expenses=rows.filter(x=>x.type==='EXPENSE');const sum=(xs:any[])=>xs.reduce((a,x)=>a+Number(x.amount),0);const overdue=income.filter(x=>x.status!=='PAID'&&x.dueDate.toISOString().slice(0,10)<today);const due7=new Date(now);due7.setDate(due7.getDate()+7);return res.json({receivable:sum(income.filter(x=>x.status!=='PAID')),overdue:sum(overdue),received:sum(income.filter(x=>x.status==='PAID')),payable:sum(expenses.filter(x=>x.status!=='PAID')),paidExpenses:sum(expenses.filter(x=>x.status==='PAID')),cashResult:sum(income.filter(x=>x.status==='PAID'))-sum(expenses.filter(x=>x.status==='PAID')),dueNext7Days:rows.filter(x=>x.status!=='PAID'&&x.dueDate>=now&&x.dueDate<=due7).map(x=>({id:x.id,type:x.type,description:x.description,personName:x.personName,amount:x.amount,dueDate:x.dueDate,status:x.status}))})}catch(e){console.error(e);return res.status(500).json({error:'Erro no painel financeiro.'})}
}

export async function importRules(req:AuthRequest,res:Response){try{const {clinicId,tenantId}=context(req);return res.json(await prisma.expenseImportRule.findMany({where:{clinicId,tenantId},orderBy:{name:'asc'}}))}catch(e){return res.status(500).json({error:'Erro ao listar regras.'})}}
export async function createImportRule(req:AuthRequest,res:Response){try{const {clinicId,tenantId}=context(req);const b=req.body;const row=await prisma.expenseImportRule.create({data:{clinicId,tenantId,name:String(b.name),matchText:b.matchText,matchDocument:b.matchDocument,category:String(b.category||'GERAL'),costCenter:b.costCenter,accountingMode:b.accountingMode,autoCreate:Boolean(b.autoCreate),isActive:b.isActive!==false}});return res.status(201).json(row)}catch(e){return res.status(500).json({error:'Erro ao criar regra.'})}}
export async function bankConnections(req:AuthRequest,res:Response){try{const {clinicId,tenantId}=context(req);return res.json(await prisma.bankConnection.findMany({where:{clinicId,tenantId},select:{id:true,provider:true,bankName:true,accountLabel:true,accountType:true,last4:true,isActive:true,syncMode:true,lastSyncAt:true,createdAt:true,updatedAt:true}}))}catch(e){return res.status(500).json({error:'Erro ao listar contas.'})}}
