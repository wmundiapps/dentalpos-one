import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

export async function index(req: AuthRequest, res: Response) {
  try { const {clinicId,tenantId}=ctx(req); const patients=await prisma.patient.findMany({where:{clinicId,tenantId},orderBy:{fullName:'asc'}}); return res.status(200).json(patients) }
  catch(error){console.error('Erro ao listar pacientes:',error);return res.status(500).json({error:'Erro ao listar pacientes.'})}
}
export async function show(req: AuthRequest,res:Response){try{const{clinicId,tenantId}=ctx(req);const id=String(req.params.id);const patient=await prisma.patient.findFirst({where:{id,clinicId,tenantId}});if(!patient)return res.status(404).json({error:'Paciente não encontrado.'});return res.json(patient)}catch(error){console.error(error);return res.status(500).json({error:'Erro ao buscar paciente.'})}}
export async function store(req: AuthRequest,res:Response){try{const{clinicId,tenantId,actorId}=ctx(req);const {clinicId:_c,tenantId:_t,id:_id,...payload}=req.body;const patient=await prisma.patient.create({data:{...payload,clinicId,tenantId}});await writeAudit({clinicId,tenantId,actorId,module:'patients',action:'PATIENT_CREATE',entityType:'Patient',entityId:patient.id,summary:`Paciente ${patient.fullName} cadastrado.`});return res.status(201).json(patient)}catch(error){console.error(error);return res.status(500).json({error:'Erro ao cadastrar paciente.'})}}
export async function update(req: AuthRequest,res:Response){try{const{clinicId,tenantId,actorId}=ctx(req);const id=String(req.params.id);const existing=await prisma.patient.findFirst({where:{id,clinicId,tenantId}});if(!existing)return res.status(404).json({error:'Paciente não encontrado.'});const {clinicId:_c,tenantId:_t,id:_id,...payload}=req.body;const patient=await prisma.patient.update({where:{id},data:payload});await writeAudit({clinicId,tenantId,actorId,module:'patients',action:'PATIENT_UPDATE',entityType:'Patient',entityId:id,beforeData:existing,afterData:patient,summary:`Cadastro de ${patient.fullName} atualizado.`});return res.json(patient)}catch(error){console.error(error);return res.status(500).json({error:'Erro ao atualizar paciente.'})}}
export async function remove(req: AuthRequest,res:Response){try{const{clinicId,tenantId,actorId}=ctx(req);const id=String(req.params.id);const existing=await prisma.patient.findFirst({where:{id,clinicId,tenantId}});if(!existing)return res.status(404).json({error:'Paciente não encontrado.'});await prisma.patient.update({where:{id},data:{isActive:false}});await writeAudit({clinicId,tenantId,actorId,module:'patients',action:'PATIENT_DEACTIVATE',entityType:'Patient',entityId:id,summary:`Paciente ${existing.fullName} inativado.`});return res.json({message:'Paciente inativado com sucesso.'})}catch(error){console.error(error);return res.status(500).json({error:'Erro ao inativar paciente.'})}}
