import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const DF=['contractType','croState','rqe','cpf','rg','personalAddress','personalCity','personalState','personalZipCode','companyName','tradeName','cnpj','companyCro','technicalManager','companyAddress','companyCity','companyState','companyZipCode','municipalRegistration','documentIssuer','revenueModel','revenueBase','materialSplit','labSplit','cardFeeSplit','bankName','bankAgency','bankAccount','pixKey','notes']
const DD=['birthDate','contractStartDate','contractEndDate']
const DN=['revenuePercent','commissionPercent','payoutDay']
export function doctorExtra(b:Record<string,unknown>){
  const d:Record<string,unknown>={}
  for(const k of DF){ if(b[k]===undefined)continue; const v=String(b[k]??'').trim(); d[k]=v||null }
  if(b.specialties!==undefined) d.specialties=Array.isArray(b.specialties)?(b.specialties as unknown[]).map(String).filter(Boolean):[]
  for(const k of DD){ if(b[k]===undefined)continue; const v=String(b[k]??''); d[k]=v?new Date(v):null }
  for(const k of DN){ if(b[k]===undefined)continue; const v=b[k]; if(v===null||v===''){d[k]=null;continue} const p=Number(v); if(!Number.isFinite(p)||p<0)throw new Error('Valor invalido em '+k); d[k]=k==='payoutDay'?Math.round(p):p }
  return d
}

export async function documents(req:AuthRequest,res:Response){try{const{clinicId,tenantId}=ctx(req);const doctorId=String(req.params.id);const d=await prisma.doctor.findFirst({where:{id:doctorId,clinicId,tenantId},select:{id:true}});if(!d)return res.status(404).json({error:'Profissional nao encontrado.'});return res.json(await prisma.doctorDocument.findMany({where:{doctorId,deletedAt:null},orderBy:{createdAt:'desc'}}))}catch(e){console.error(e);return res.status(500).json({error:'Erro ao listar documentos.'})}}

export async function addDocument(req:AuthRequest,res:Response){try{const{clinicId,tenantId,actorId}=ctx(req);const doctorId=String(req.params.id);const d=await prisma.doctor.findFirst({where:{id:doctorId,clinicId,tenantId},select:{id:true}});if(!d)return res.status(404).json({error:'Profissional nao encontrado.'});const b=req.body||{};const documentType=String(b.documentType||'').trim();const title=String(b.title||'').trim();if(!documentType||!title)return res.status(400).json({error:'Tipo e titulo sao obrigatorios.'});const row=await prisma.doctorDocument.create({data:{clinicId,tenantId,doctorId,documentType,title,fileName:b.fileName?String(b.fileName):null,issueDate:b.issueDate?new Date(String(b.issueDate)):null,expiresAt:b.expiresAt?new Date(String(b.expiresAt)):null,notes:b.notes?String(b.notes):null,createdById:actorId}});await writeAudit({clinicId,tenantId,actorId,module:'doctors',action:'DOCTOR_DOCUMENT_ADD',entityType:'DoctorDocument',entityId:row.id,summary:documentType+': '+title});return res.status(201).json(row)}catch(e){console.error(e);return res.status(500).json({error:'Erro ao registrar documento.'})}}

export async function removeDocument(req:AuthRequest,res:Response){try{const{clinicId,tenantId,actorId}=ctx(req);const id=String(req.params.documentId);const ex=await prisma.doctorDocument.findFirst({where:{id,clinicId,tenantId,deletedAt:null}});if(!ex)return res.status(404).json({error:'Documento nao encontrado.'});await prisma.doctorDocument.update({where:{id},data:{deletedAt:new Date()}});await writeAudit({clinicId,tenantId,actorId,module:'doctors',action:'DOCTOR_DOCUMENT_ARCHIVE',entityType:'DoctorDocument',entityId:id});return res.status(204).send()}catch(e){console.error(e);return res.status(500).json({error:'Erro ao arquivar documento.'})}}

const safeUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  phone: true,
  avatar: true,
  isActive: true
}

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const doctors = await prisma.doctor.findMany({
      where: { clinicId, tenantId, isActive: true },
      include: { user: { select: safeUserSelect } },
      orderBy: { createdAt: 'desc' }
    })
    return res.status(200).json(doctors)
  } catch (error) {
    console.error('Erro ao listar profissionais:', error)
    return res.status(500).json({ error: 'Erro ao listar profissionais.' })
  }
}

export async function show(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const id = String(req.params.id)
    const doctor = await prisma.doctor.findFirst({
      where: { id, clinicId, tenantId },
      include: { user: { select: safeUserSelect } }
    })

    if (!doctor) return res.status(404).json({ error: 'Profissional não encontrado.' })
    return res.status(200).json(doctor)
  } catch (error) {
    console.error('Erro ao buscar profissional:', error)
    return res.status(500).json({ error: 'Erro ao buscar profissional.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const userId = String(req.body.userId || '')
    const cro = String(req.body.cro || '').trim()
    const specialty = String(req.body.specialty || '').trim()

    if (!userId || !cro || !specialty) {
      return res.status(400).json({ error: 'Usuário, CRO e especialidade são obrigatórios.' })
    }

    const linkedUser = await prisma.user.findFirst({ where: { id: userId, clinicId, tenantId, isActive: true } })
    if (!linkedUser) return res.status(400).json({ error: 'Usuário não pertence à clínica atual.' })

    let consultationValue: number | undefined
    if (req.body.consultationValue !== undefined && req.body.consultationValue !== null && req.body.consultationValue !== '') {
      const parsed = Number(req.body.consultationValue)
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'Valor da consulta inválido.' })
      }
      consultationValue = parsed
    }

    const doctor = await prisma.doctor.create({
      data: {
        clinicId,
        tenantId,
        userId,
        cro,
        specialty,
        bio: req.body.bio ? String(req.body.bio) : undefined,
        photo: req.body.photo ? String(req.body.photo) : undefined,
        consultationValue,
        isActive: req.body.isActive !== false,
        ...doctorExtra(req.body)
      }
    })

    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'doctors',
      action: 'DOCTOR_CREATE',
      entityType: 'Doctor',
      entityId: doctor.id,
      summary: `Profissional ${cro} cadastrado.`
    })

    return res.status(201).json(doctor)
  } catch (error) {
    console.error('Erro ao cadastrar profissional:', error)
    return res.status(500).json({ error: 'Erro ao cadastrar profissional.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.doctor.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Profissional não encontrado.' })

    const allowed = ['cro', 'specialty', 'bio', 'photo', 'isActive', 'consultationValue']
    const data: Record<string, unknown> = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowed.includes(key))
    )
    if ('consultationValue' in data) {
      if (data.consultationValue === null || data.consultationValue === '') {
        data.consultationValue = null
      } else {
        const parsed = Number(data.consultationValue)
        if (!Number.isFinite(parsed) || parsed < 0) {
          return res.status(400).json({ error: 'Valor da consulta inválido.' })
        }
        data.consultationValue = parsed
      }
    }
    const doctor = await prisma.doctor.update({
      where: { id },
      data: { ...data, ...doctorExtra(req.body) },
      include: { user: { select: safeUserSelect } }
    })

    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'doctors',
      action: 'DOCTOR_UPDATE',
      entityType: 'Doctor',
      entityId: id,
      beforeData: existing,
      afterData: doctor
    })

    return res.status(200).json(doctor)
  } catch (error) {
    console.error('Erro ao atualizar profissional:', error)
    return res.status(500).json({ error: 'Erro ao atualizar profissional.' })
  }
}

export async function remove(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.doctor.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Profissional não encontrado.' })

    await prisma.doctor.update({ where: { id }, data: { isActive: false } })
    await writeAudit({
      clinicId,
      tenantId,
      actorId,
      module: 'doctors',
      action: 'DOCTOR_DEACTIVATE',
      entityType: 'Doctor',
      entityId: id,
      summary: `Profissional ${existing.cro} inativado.`
    })

    return res.status(200).json({ message: 'Profissional inativado com sucesso.' })
  } catch (error) {
    console.error('Erro ao remover profissional:', error)
    return res.status(500).json({ error: 'Erro ao remover profissional.' })
  }
}
