import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorUserId: req.user.id }
}

export async function patientClinical(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const patientId = String(req.params.patientId)
    const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId } })
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' })
    const [odontogram, evolutions, treatmentItems] = await Promise.all([
      prisma.odontogramMark.findMany({ where:{ patientId, clinicId, tenantId }, orderBy:[{tooth:'asc'},{createdAt:'asc'}] }),
      prisma.clinicalEvolution.findMany({ where:{ patientId, clinicId, tenantId }, orderBy:{createdAt:'desc'} }),
      prisma.treatmentItem.findMany({ where:{ patientId, clinicId, tenantId }, orderBy:{createdAt:'asc'} }),
    ])
    return res.json({ patient, odontogram, evolutions, treatmentItems })
  } catch (error) { console.error(error); return res.status(500).json({error:'Erro ao carregar prontuário clínico.'}) }
}

export async function upsertOdontogramMark(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req); const patientId=String(req.params.patientId)
    const { id, tooth, surface, finding, state='PENDING' } = req.body
    const patient=await prisma.patient.findFirst({where:{id:patientId,clinicId,tenantId}}); if(!patient)return res.status(404).json({error:'Paciente não encontrado.'})
    const mark = id ? await prisma.odontogramMark.update({where:{id},data:{tooth:Number(tooth),surface:surface||null,finding,state}}) : await prisma.odontogramMark.create({data:{clinicId,tenantId,patientId,tooth:Number(tooth),surface:surface||null,finding,state}})
    await prisma.treatmentItem.upsert({where:{odontogramMarkId:mark.id},update:{tooth:Number(tooth),surfaces:surface?[surface]:[],procedure:finding,status:state==='DONE'?'COMPLETED':'PLANNED',completedAt:state==='DONE'?new Date():null},create:{clinicId,tenantId,patientId,tooth:Number(tooth),surfaces:surface?[surface]:[],procedure:finding,status:state==='DONE'?'COMPLETED':'PLANNED',origin:'ODONTOGRAM',odontogramMarkId:mark.id,completedAt:state==='DONE'?new Date():null}})
    await writeAudit({clinicId,tenantId,actorId:actorUserId,module:'clinical',action:id?'ODONTOGRAM_UPDATE':'ODONTOGRAM_CREATE',entityType:'OdontogramMark',entityId:mark.id,metadata:{patientId,tooth,surface,finding,state}})
    return res.status(id?200:201).json(mark)
  } catch(error){console.error(error);return res.status(500).json({error:'Erro ao salvar odontograma.'})}
}

export async function createEvolution(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorUserId } = ctx(req); const patientId=String(req.params.patientId)
    const { professionalName, professionalId, procedure, notes, nextProcedure, completedMarkIds=[], nextAppointmentCreated=false }=req.body
    if(!procedure?.trim()||!notes?.trim()||!nextProcedure?.trim()||!Array.isArray(completedMarkIds)||completedMarkIds.length===0)return res.status(400).json({error:'Procedimento, evolução, próximo procedimento e marcações do odontograma são obrigatórios.'})
    const evolution=await prisma.$transaction(async tx=>{
      const row=await tx.clinicalEvolution.create({data:{clinicId,tenantId,patientId,professionalName,professionalId:professionalId||null,procedure,notes,nextProcedure,nextAppointmentCreated}})
      await tx.odontogramMark.updateMany({where:{id:{in:completedMarkIds},patientId,clinicId,tenantId},data:{state:'DONE',completedAt:new Date(),sourceEvolutionId:row.id}})
      await tx.treatmentItem.updateMany({where:{patientId,clinicId,tenantId,odontogramMarkId:{in:completedMarkIds}},data:{status:'COMPLETED',completedAt:new Date()}})
      return row
    })
    await writeAudit({clinicId,tenantId,actorId:actorUserId,module:'clinical',action:'CLINICAL_EVOLUTION_CREATE',entityType:'ClinicalEvolution',entityId:evolution.id,metadata:{patientId,procedure,nextProcedure,completedMarkIds}})
    return res.status(201).json(evolution)
  }catch(error){console.error(error);return res.status(500).json({error:'Erro ao registrar evolução clínica.'})}
}

export async function treatmentPlan(req:AuthRequest,res:Response){try{const{clinicId,tenantId}=ctx(req);const patientId=String(req.params.patientId);const rows=await prisma.treatmentItem.findMany({where:{patientId,clinicId,tenantId},orderBy:{createdAt:'asc'}});return res.json(rows)}catch(error){console.error(error);return res.status(500).json({error:'Erro ao carregar plano de tratamento.'})}}
