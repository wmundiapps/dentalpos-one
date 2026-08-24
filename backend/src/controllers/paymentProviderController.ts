import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { encryptSecret } from '../services/secretVault'
import { createCharge } from '../services/paymentAdapterService'

export async function index(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  const rows = await prisma.paymentProviderConfig.findMany({ where: { clinicId: req.user.clinicId, tenantId: req.user.tenantId }, select: { id:true, provider:true, environment:true, isActive:true, credentialsConfigured:true, webhookConfigured:true, settings:true, createdAt:true, updatedAt:true }, orderBy: { provider: 'asc' } })
  return res.json(rows)
}

export async function upsert(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  const raw=Array.isArray(req.params.provider)?req.params.provider[0]:req.params.provider
  const provider = String(raw || '').toUpperCase()
  if (!['ASAAS','STRIPE','BANK'].includes(provider)) return res.status(400).json({ error: 'Provedor inválido.' })
  const before = await prisma.paymentProviderConfig.findUnique({ where: { clinicId_provider: { clinicId: req.user.clinicId, provider } } })
  const b = req.body; const encryptedCredentials = b.credentials ? encryptSecret(b.credentials) : undefined
  const row = await prisma.paymentProviderConfig.upsert({where:{clinicId_provider:{clinicId:req.user.clinicId,provider}},update:{environment:String(b.environment||before?.environment||'TEST'),isActive:Boolean(b.isActive),credentialsConfigured:Boolean(b.credentials||b.credentialsConfigured||before?.credentialsConfigured),webhookConfigured:Boolean(b.webhookConfigured),settings:b.settings||undefined,...(encryptedCredentials?{encryptedCredentials}:{})},create:{clinicId:req.user.clinicId,tenantId:req.user.tenantId,provider,environment:String(b.environment||'TEST'),isActive:Boolean(b.isActive),credentialsConfigured:Boolean(b.credentials||b.credentialsConfigured),webhookConfigured:Boolean(b.webhookConfigured),settings:b.settings||undefined,encryptedCredentials}})
  await writeAudit({ clinicId:req.user.clinicId,tenantId:req.user.tenantId,actorId:req.user.id,module:'finance',action:'PAYMENT_PROVIDER_CONFIG',entityType:'PaymentProviderConfig',entityId:row.id,beforeData:before,afterData:row,summary:`Configuração ${provider} atualizada.` })
  return res.json(row)
}

export async function createIntent(req:AuthRequest,res:Response){
  if(!req.user)return res.status(401).json({error:'Não autenticado.'})
  const provider=String(req.body.provider||'ASAAS').toUpperCase().replace('BANCO / OPEN FINANCE','BANK'); const amount=Number(req.body.amount||0)
  if(amount<=0)return res.status(400).json({error:'Valor inválido.'})
  const config=await prisma.paymentProviderConfig.findUnique({where:{clinicId_provider:{clinicId:req.user.clinicId,provider}}})
  if(!config?.isActive||!config.credentialsConfigured)return res.status(409).json({error:`${provider} ainda não está habilitado para cobrança real.`})
  try{
    const result=await createCharge(config,{amount,method:String(req.body.method||'PIX'),description:String(req.body.description||'Cobrança DentalPos'),dueDate:req.body.dueDate,installments:Number(req.body.installments||1),customer:{name:String(req.body.customer?.name||req.body.personName||'Paciente'),email:req.body.customer?.email,phone:req.body.customer?.phone,cpfCnpj:req.body.customer?.cpfCnpj},metadata:{clinicId:req.user.clinicId,originId:String(req.body.originId||'')}})
    if(req.body.paymentId){await prisma.payment.updateMany({where:{id:String(req.body.paymentId),clinicId:req.user.clinicId},data:{externalId:result.externalId,provider,transactionStatus:result.status}})}
    if(req.body.financialEntryId){await prisma.financialEntry.updateMany({where:{id:String(req.body.financialEntryId),clinicId:req.user.clinicId},data:{externalId:result.externalId,provider,barcode:result.barcode,digitableLine:result.digitableLine}})}
    return res.status(201).json(result)
  }catch(error:any){return res.status(502).json({error:error?.message||'Falha ao criar cobrança no provedor.'})}
}
