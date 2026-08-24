import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

function eventId(body:any, fallback:string){return String(body?.id || body?.event?.id || body?.data?.object?.id || fallback)}

export async function asaas(req:Request,res:Response){
  const expected=process.env.ASAAS_WEBHOOK_TOKEN
  if(expected && req.headers['asaas-access-token']!==expected && req.headers['access-token']!==expected) return res.status(401).json({error:'Webhook não autorizado.'})
  const body=req.body||{}; const id=eventId(body,`asaas-${Date.now()}`); const type=String(body.event||'UNKNOWN')
  try{
    await prisma.integrationWebhookEvent.create({data:{provider:'ASAAS',externalEventId:id,eventType:type,payload:body}})
  }catch(e:any){if(String(e?.code)==='P2002') return res.json({ok:true,duplicate:true}); throw e}
  const paymentId=body?.payment?.id
  if(paymentId){
    const statusMap:Record<string,string>={PAYMENT_RECEIVED:'PAID',PAYMENT_CONFIRMED:'PAID',PAYMENT_OVERDUE:'OVERDUE',PAYMENT_REFUNDED:'REFUNDED',PAYMENT_DELETED:'CANCELLED'}
    const status=statusMap[type]
    if(status){
      const rows=await prisma.payment.findMany({where:{externalId:paymentId}})
      for(const row of rows){await prisma.payment.update({where:{id:row.id},data:{status,paidDate:status==='PAID'?new Date():row.paidDate,transactionStatus:String(body?.payment?.status||status),grossAmount:Number(body?.payment?.value||row.grossAmount||row.amount),netAmount:Number(body?.payment?.netValue||row.netAmount||row.amount)}});await prisma.financialEntry.updateMany({where:{originId:row.budgetId,installment:row.installment},data:{status:status==='PAID'?'PAID':status,paidAt:status==='PAID'?new Date():undefined,externalId:paymentId}})}
    }
  }
  await prisma.integrationWebhookEvent.update({where:{provider_externalEventId:{provider:'ASAAS',externalEventId:id}},data:{status:'PROCESSED',processedAt:new Date()}})
  return res.json({ok:true})
}

export async function stripe(req:Request,res:Response){
  const body=req.body||{}; const id=eventId(body,`stripe-${Date.now()}`); const type=String(body.type||'UNKNOWN')
  try{await prisma.integrationWebhookEvent.create({data:{provider:'STRIPE',externalEventId:id,eventType:type,payload:body}})}catch(e:any){if(String(e?.code)==='P2002')return res.json({ok:true,duplicate:true});throw e}
  const obj=body?.data?.object; const externalId=obj?.id
  if(externalId){const status=type==='payment_intent.succeeded'?'PAID':type==='payment_intent.payment_failed'?'FAILED':undefined;if(status){await prisma.payment.updateMany({where:{externalId},data:{status,paidDate:status==='PAID'?new Date():undefined,transactionStatus:String(obj?.status||status)}});await prisma.financialEntry.updateMany({where:{externalId},data:{status:status==='PAID'?'PAID':status,paidAt:status==='PAID'?new Date():undefined}})}}
  await prisma.integrationWebhookEvent.update({where:{provider_externalEventId:{provider:'STRIPE',externalEventId:id}},data:{status:'PROCESSED',processedAt:new Date()}})
  return res.json({ok:true})
}
