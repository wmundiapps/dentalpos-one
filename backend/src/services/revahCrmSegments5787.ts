import prisma from '../lib/prisma'

export type RevahSegment =
  | 'AGENDA_AMANHA'|'FALTOSOS'|'DEVEDORES'|'SEM_PROXIMO_AGENDAMENTO'
  | 'REATIVACAO_30'|'REATIVACAO_60'|'REATIVACAO_90'|'REATIVACAO_120'
  | 'REATIVACAO_150'|'REATIVACAO_180'|'REATIVACAO_18_MESES'

export async function buildRevahSegment(clinicId:string,segment:RevahSegment){
  const now=new Date()
  if(segment==='AGENDA_AMANHA'){
    const start=new Date(now);start.setDate(start.getDate()+1);start.setHours(0,0,0,0)
    const end=new Date(start);end.setHours(23,59,59,999)
    return prisma.appointment.findMany({where:{clinicId,scheduledAt:{gte:start,lte:end}},include:{patient:true}})
  }
  if(segment==='FALTOSOS'){
    const since=new Date(now);since.setDate(since.getDate()-30)
    return prisma.appointment.findMany({
      where:{clinicId,scheduledAt:{gte:since,lte:now},status:{in:['NO_SHOW','MISSED','FALTOU','AUSENTE']}},
      include:{patient:true},orderBy:{scheduledAt:'desc'}
    })
  }
  if(segment==='DEVEDORES'){
    return prisma.financialEntry.findMany({
      where:{clinicId,dueDate:{lt:now},status:{notIn:['PAID','RECEIVED','PAGO','RECEBIDO']}},
      include:{patient:true},orderBy:{dueDate:'asc'}
    })
  }
  return []
}
