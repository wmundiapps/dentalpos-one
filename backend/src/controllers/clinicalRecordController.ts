import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import * as records from '../services/clinicalRecordService'
import { customFieldSchema, saveClinicalRecordSchema } from '../validators/clinicalRecordValidator'

function context(req: AuthRequest) {
  if (!req.user) throw Object.assign(new Error('Usuário não autenticado.'), { statusCode:401 })
  return { clinicId:req.user.clinicId, tenantId:req.user.tenantId, actorId:req.user.id, actorName:req.user.email }
}

function failure(res: Response, error: unknown, fallback: string) {
  const value = error as { statusCode?:number; message?:string; issues?:unknown }
  if (value.issues) return res.status(400).json({ error:'Dados clínicos inválidos.', details:value.issues })
  return res.status(value.statusCode || 500).json({ error:value.message || fallback })
}

export async function show(req: AuthRequest, res: Response) {
  try { const c=context(req); return res.json(await records.getClinicalRecord(c.clinicId,c.tenantId,String(req.params.patientId))) }
  catch(error) { console.error(error); return failure(res,error,'Erro ao carregar prontuário.') }
}

export async function save(req: AuthRequest, res: Response) {
  try {
    const c=context(req); const patientId=String(req.params.patientId); const payload=saveClinicalRecordSchema.parse(req.body)
    const result=await records.saveClinicalRecord({...c,patientId,...payload,ipAddress:req.ip,userAgent:req.get('user-agent')})
    return res.status(result.record.revisionNumber===1?201:200).json(result)
  } catch(error) { console.error(error); return failure(res,error,'Erro ao salvar prontuário.') }
}

export async function revision(req: AuthRequest, res: Response) {
  try {
    const c=context(req); const patientId=String(req.params.patientId); await records.assertPatient(c.clinicId,c.tenantId,patientId)
    const row=await prisma.patientClinicalRecordRevision.findFirst({where:{id:String(req.params.revisionId),patientId,clinicId:c.clinicId,tenantId:c.tenantId}})
    if(!row)return res.status(404).json({error:'Revisão não encontrada.'}); return res.json(row)
  } catch(error) { return failure(res,error,'Erro ao carregar revisão.') }
}

export async function listCustomFields(req: AuthRequest, res: Response) {
  try { const c=context(req); return res.json(await prisma.clinicalCustomFieldDefinition.findMany({where:{clinicId:c.clinicId,tenantId:c.tenantId},orderBy:[{section:'asc'},{displayOrder:'asc'}]})) }
  catch(error) { return failure(res,error,'Erro ao listar campos configuráveis.') }
}

export async function upsertCustomField(req: AuthRequest, res: Response) {
  try {
    const c=context(req); const payload=customFieldSchema.parse(req.body); const id=req.params.fieldId ? String(req.params.fieldId) : null
    const existing=id?await prisma.clinicalCustomFieldDefinition.findFirst({where:{id,clinicId:c.clinicId,tenantId:c.tenantId}}):null
    if(id&&!existing)return res.status(404).json({error:'Campo configurável não encontrado.'})
    const row=existing?await prisma.clinicalCustomFieldDefinition.update({where:{id:existing.id},data:{...payload,updatedById:c.actorId}}):await prisma.clinicalCustomFieldDefinition.create({data:{...payload,clinicId:c.clinicId,tenantId:c.tenantId,createdById:c.actorId,updatedById:c.actorId}})
    await writeAudit({clinicId:c.clinicId,tenantId:c.tenantId,actorId:c.actorId,module:'clinical',action:existing?'CLINICAL_CUSTOM_FIELD_UPDATE':'CLINICAL_CUSTOM_FIELD_CREATE',entityType:'ClinicalCustomFieldDefinition',entityId:row.id,beforeData:existing,afterData:row,ipAddress:req.ip,userAgent:req.get('user-agent')})
    return res.status(existing?200:201).json(row)
  } catch(error) { return failure(res,error,'Erro ao salvar campo configurável.') }
}
