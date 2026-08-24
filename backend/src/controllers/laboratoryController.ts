import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const includeDetails = { patient: true, history: { orderBy: { createdAt: 'desc' as const } }, designCase: true }
const parseDate = (value: unknown) => value ? new Date(String(value)) : undefined

export async function index(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  const rows = await prisma.laboratoryWork.findMany({ where: { clinicId:req.user.clinicId, tenantId:req.user.tenantId }, include:includeDetails, orderBy:{ updatedAt:'desc' } })
  return res.json(rows)
}

export async function store(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado.' })
  const b=req.body
  if (!String(b.workType||'').trim() || !String(b.toothShade||'').trim()) return res.status(400).json({ error:'Tipo de trabalho e cor do dente são obrigatórios.' })
  const count=await prisma.laboratoryWork.count({ where:{ clinicId:req.user.clinicId } })
  const trackingCode=`LAB-${new Date().getFullYear()}-${String(count+1).padStart(4,'0')}`
  const row=await prisma.$transaction(async tx=>{
    const created=await tx.laboratoryWork.create({ data:{ clinicId:req.user!.clinicId,tenantId:req.user!.tenantId,patientId:b.patientId||null,trackingCode,dentistName:String(b.dentistName||'A definir'),workType:String(b.workType),teeth:b.teeth?String(b.teeth):null,material:b.material?String(b.material):null,responsibleTechnician:b.responsibleTechnician?String(b.responsibleTechnician):null,impressionType:b.impressionType?String(b.impressionType):null,receivedItems:Array.isArray(b.receivedItems)?b.receivedItems.map(String):[],toothShade:String(b.toothShade),shadeSystem:b.shadeSystem?String(b.shadeSystem):null,shadeNotes:b.shadeNotes?String(b.shadeNotes):null,patientAge:b.patientAge?Number(b.patientAge):null,patientSex:b.patientSex?String(b.patientSex):null,faceBiotype:b.faceBiotype?String(b.faceBiotype):null,faceShape:b.faceShape?String(b.faceShape):null,faceDescription:b.faceDescription?String(b.faceDescription):null,dueDate:parseDate(b.dueDate),patientReturnDate:parseDate(b.patientReturnDate),nextAction:b.nextAction?String(b.nextAction):null,priority:String(b.priority||'NORMAL'),source:String(b.source||'LABORATORY'),observations:b.observations?String(b.observations):null } })
    await tx.laboratoryWorkHistory.create({data:{clinicId:req.user!.clinicId,tenantId:req.user!.tenantId,laboratoryWorkId:created.id,actorId:req.user!.id,action:'CREATED',description:'Trabalho criado na fila do laboratório.'}})
    return created
  })
  await writeAudit({clinicId:req.user.clinicId,tenantId:req.user.tenantId,actorId:req.user.id,module:'laboratory',action:'create',entityType:'LaboratoryWork',entityId:row.id,summary:`Trabalho ${trackingCode} criado`,afterData:row,ipAddress:req.ip,userAgent:req.get('user-agent')})
  return res.status(201).json(await prisma.laboratoryWork.findUnique({where:{id:row.id},include:includeDetails}))
}

export async function update(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error:'Não autenticado.' })
  const existing=await prisma.laboratoryWork.findFirst({where:{id:String(req.params.id),clinicId:req.user.clinicId,tenantId:req.user.tenantId}})
  if(!existing) return res.status(404).json({error:'Trabalho não encontrado.'})
  const b=req.body
  const data:any={}
  for(const key of ['dentistName','workType','teeth','material','responsibleTechnician','impressionType','toothShade','shadeSystem','shadeNotes','patientSex','faceBiotype','faceShape','faceDescription','nextAction','status','priority','observations','designStatus']) if(b[key]!==undefined)data[key]=b[key]
  if(b.receivedItems!==undefined)data.receivedItems=Array.isArray(b.receivedItems)?b.receivedItems.map(String):[]
  if(b.patientAge!==undefined)data.patientAge=b.patientAge?Number(b.patientAge):null
  if(b.dueDate!==undefined)data.dueDate=parseDate(b.dueDate)||null
  if(b.patientReturnDate!==undefined)data.patientReturnDate=parseDate(b.patientReturnDate)||null
  const updated=await prisma.$transaction(async tx=>{ const row=await tx.laboratoryWork.update({where:{id:existing.id},data}); await tx.laboratoryWorkHistory.create({data:{clinicId:req.user!.clinicId,tenantId:req.user!.tenantId,laboratoryWorkId:row.id,actorId:req.user!.id,action:'UPDATED',description:String(b.historyDescription||'Ficha laboratorial atualizada.')}}); return row })
  await writeAudit({clinicId:req.user.clinicId,tenantId:req.user.tenantId,actorId:req.user.id,module:'laboratory',action:'edit',entityType:'LaboratoryWork',entityId:updated.id,summary:'Trabalho laboratorial atualizado',beforeData:existing,afterData:updated,ipAddress:req.ip,userAgent:req.get('user-agent')})
  return res.json(await prisma.laboratoryWork.findUnique({where:{id:updated.id},include:includeDetails}))
}

export async function openDesign(req: AuthRequest, res: Response) {
  if(!req.user)return res.status(401).json({error:'Não autenticado.'})
  const work=await prisma.laboratoryWork.findFirst({where:{id:String(req.params.id),clinicId:req.user.clinicId,tenantId:req.user.tenantId}})
  if(!work)return res.status(404).json({error:'Trabalho não encontrado.'})
  const toothNumbers=String(work.teeth||'').match(/\d{2}/g)||[]
  const design=await prisma.$transaction(async tx=>{ const row=await tx.dentalDesignCase.upsert({where:{laboratoryWorkId:work.id},update:{status:'PREPARING'},create:{clinicId:req.user!.clinicId,tenantId:req.user!.tenantId,patientId:work.patientId,laboratoryWorkId:work.id,toothNumbers,notes:work.observations}}); await tx.laboratoryWork.update({where:{id:work.id},data:{designStatus:'PREPARING'}}); await tx.laboratoryWorkHistory.create({data:{clinicId:req.user!.clinicId,tenantId:req.user!.tenantId,laboratoryWorkId:work.id,actorId:req.user!.id,action:'SENT_TO_DESIGN',description:'Caso encaminhado ao DentalPos Design.'}}); return row })
  return res.json(design)
}
