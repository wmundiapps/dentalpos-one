import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

async function patient(patientId: string, clinicId: string, tenantId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, clinicId, tenantId }, select: { id: true, fullName: true } })
}

function planningData(body: any) {
  return {
    region: body.region || null,
    phase: body.phase || '1',
    priority: body.priority || 'NORMAL',
    alternative: body.alternative || null,
    specialty: body.specialty || null,
    professionalId: body.professionalId || null,
    professionalName: body.professionalName || null,
    estimatedMinutes: body.estimatedMinutes ? Number(body.estimatedMinutes) : null,
    laboratoryRequired: Boolean(body.laboratoryRequired),
    laboratoryNotes: body.laboratoryNotes || null,
    examRequired: Boolean(body.examRequired),
    surgeryRequired: Boolean(body.surgeryRequired),
    sequence: Number(body.sequence || 0),
    dependsOn: Array.isArray(body.dependsOn) ? body.dependsOn.map(String) : [],
    cbhpoCode: body.cbhpoCode || null,
    unitValue: Number(body.unitValue || 0),
    notes: body.notes || null,
  }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const c = ctx(req); const patientId = String(req.params.patientId)
    if (!await patient(patientId, c.clinicId, c.tenantId)) return res.status(404).json({ error: 'Paciente não encontrado.' })
    const items = await prisma.treatmentItem.findMany({ where: { patientId, clinicId: c.clinicId, tenantId: c.tenantId }, orderBy: [{ createdAt: 'asc' }] })
    const completed = items.filter(i => i.status === 'COMPLETED').length
    return res.json({ items, progressPercent: items.length ? Math.round(completed * 100 / items.length) : 0 })
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Erro ao carregar plano de tratamento.' }) }
}

export async function createItem(req: AuthRequest, res: Response) {
  try {
    const c=ctx(req); const patientId=String(req.params.patientId); const b=req.body
    if (!await patient(patientId,c.clinicId,c.tenantId)) return res.status(404).json({error:'Paciente não encontrado.'})
    if (!String(b.procedure||'').trim()) return res.status(400).json({error:'Procedimento é obrigatório.'})
    const row=await prisma.treatmentItem.create({data:{clinicId:c.clinicId,tenantId:c.tenantId,patientId,tooth:b.tooth?Number(b.tooth):null,surfaces:Array.isArray(b.surfaces)?b.surfaces.map(String):[],procedure:String(b.procedure),status:String(b.status||'PLANNED'),origin:String(b.origin||'MANUAL'),planningData:planningData(b)}})
    await snapshot(patientId,c,'ITEM_CREATE')
    await writeAudit({clinicId:c.clinicId,tenantId:c.tenantId,actorId:c.actorId,module:'clinical',action:'TREATMENT_ITEM_CREATE',entityType:'TreatmentItem',entityId:row.id,afterData:row})
    return res.status(201).json(row)
  } catch(error){console.error(error);return res.status(500).json({error:'Erro ao criar item do plano.'})}
}

export async function updateItem(req: AuthRequest,res:Response){
  try{const c=ctx(req);const id=String(req.params.id);const existing=await prisma.treatmentItem.findFirst({where:{id,clinicId:c.clinicId,tenantId:c.tenantId}});if(!existing)return res.status(404).json({error:'Item não encontrado.'});const b=req.body;const row=await prisma.treatmentItem.update({where:{id},data:{tooth:b.tooth===undefined?undefined:(b.tooth?Number(b.tooth):null),surfaces:b.surfaces===undefined?undefined:(Array.isArray(b.surfaces)?b.surfaces.map(String):[]),procedure:b.procedure===undefined?undefined:String(b.procedure),status:b.status===undefined?undefined:String(b.status),completedAt:b.status==='COMPLETED'?new Date():b.status?null:undefined,planningData:b.planningData||planningData({...((existing.planningData as any)||{}),...b})}});await snapshot(existing.patientId,c,'ITEM_UPDATE');await writeAudit({clinicId:c.clinicId,tenantId:c.tenantId,actorId:c.actorId,module:'clinical',action:'TREATMENT_ITEM_UPDATE',entityType:'TreatmentItem',entityId:id,beforeData:existing,afterData:row});return res.json(row)}catch(error){console.error(error);return res.status(500).json({error:'Erro ao atualizar item do plano.'})}
}

export async function importOdontogram(req:AuthRequest,res:Response){
  try{const c=ctx(req);const patientId=String(req.params.patientId);if(!await patient(patientId,c.clinicId,c.tenantId))return res.status(404).json({error:'Paciente não encontrado.'});const marks=await prisma.odontogramMark.findMany({where:{patientId,clinicId:c.clinicId,tenantId:c.tenantId,state:{not:'DONE'}}});let imported=0;for(const mark of marks){const exists=await prisma.treatmentItem.findUnique({where:{odontogramMarkId:mark.id}});if(!exists){await prisma.treatmentItem.create({data:{clinicId:c.clinicId,tenantId:c.tenantId,patientId,tooth:mark.tooth,surfaces:mark.surface?[mark.surface]:[],procedure:mark.finding,status:'PLANNED',origin:'ODONTOGRAM',odontogramMarkId:mark.id,planningData:{phase:'1',priority:'NORMAL',sequence:imported+1,unitValue:0}}});imported++}}await snapshot(patientId,c,'ODONTOGRAM_IMPORT');return res.json({imported})}catch(error){console.error(error);return res.status(500).json({error:'Erro ao importar odontograma.'})}
}

async function snapshot(patientId:string,c:{clinicId:string;tenantId:string;actorId:string},reason:string){
  const items=await prisma.treatmentItem.findMany({where:{patientId,clinicId:c.clinicId,tenantId:c.tenantId},orderBy:{createdAt:'asc'}})
  const last=await prisma.treatmentPlanRevision.findFirst({where:{patientId,clinicId:c.clinicId,tenantId:c.tenantId},orderBy:{version:'desc'},select:{version:true}})
  await prisma.treatmentPlanRevision.create({data:{clinicId:c.clinicId,tenantId:c.tenantId,patientId,version:(last?.version||0)+1,reason,snapshot:items as any,createdById:c.actorId}})
}

export async function revisions(req:AuthRequest,res:Response){try{const c=ctx(req);const patientId=String(req.params.patientId);const rows=await prisma.treatmentPlanRevision.findMany({where:{patientId,clinicId:c.clinicId,tenantId:c.tenantId},orderBy:{version:'desc'}});return res.json(rows)}catch(error){console.error(error);return res.status(500).json({error:'Erro ao carregar versões.'})}}
