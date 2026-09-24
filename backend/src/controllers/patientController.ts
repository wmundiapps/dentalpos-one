import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usu\u00e1rio n\u00e3o autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

const TEXT_FIELDS = [
  'fullName', 'email', 'phone', 'cpf', 'rg', 'gender', 'address', 'city', 'state', 'zipCode',
  'odontogram', 'medicalHistory', 'allergies', 'notes', 'status', 'treatment', 'mainComplaint', 'medications',
] as const

// Aceita "AAAA-MM-DD", "DD/MM/AAAA" ou ISO completo. Vazio vira null.
function parseBirthDate(value: unknown): Date | null | 'invalid' {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  let date: Date
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) date = new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00.000Z`)
  else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) date = new Date(`${raw}T12:00:00.000Z`)
  else date = new Date(raw)
  if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() || date.getUTCFullYear() < 1900) return 'invalid'
  return date
}

// Monta os dados só com campos conhecidos. "partial" = atualização (só o que veio).
function buildPatientData(body: Record<string, unknown>, partial: boolean) {
  const data: Record<string, unknown> = {}
  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue
    const value = body[field]
    const text = value === null || value === undefined ? '' : String(value).trim()
    data[field] = text ? text : null
  }
  if ('birthDate' in body) {
    const parsed = parseBirthDate(body.birthDate)
    if (parsed === 'invalid') return { error: 'Data de nascimento inv\u00e1lida.' }
    data.birthDate = parsed
  }
  if ('isActive' in body && typeof body.isActive === 'boolean') data.isActive = body.isActive
  for (const list of ['photos', 'xrays'] as const) {
    if (Array.isArray(body[list])) data[list] = (body[list] as unknown[]).map(String)
  }
  if (!partial || 'fullName' in data) {
    if (!data.fullName || String(data.fullName).length < 2) return { error: 'Informe o nome do paciente.' }
  }
  if (!partial || 'phone' in data) {
    const digits = String(data.phone || '').replace(/\D/g, '')
    if (digits.length < 10) return { error: 'Informe o telefone/WhatsApp com DDD.' }
  }
  if (!partial && !data.status) data.status = 'Ativo'
  return { data }
}

export async function index(req: AuthRequest, res: Response) {
  try { const {clinicId,tenantId}=ctx(req); const patients=await prisma.patient.findMany({where:{clinicId,tenantId},orderBy:{fullName:'asc'}}); return res.status(200).json(patients) }
  catch(error){console.error('Erro ao listar pacientes:',error);return res.status(500).json({error:'Erro ao listar pacientes.'})}
}
export async function show(req: AuthRequest,res:Response){try{const{clinicId,tenantId}=ctx(req);const id=String(req.params.id);const patient=await prisma.patient.findFirst({where:{id,clinicId,tenantId}});if(!patient)return res.status(404).json({error:'Paciente n\u00e3o encontrado.'});return res.json(patient)}catch(error){console.error(error);return res.status(500).json({error:'Erro ao buscar paciente.'})}}

export async function store(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const built = buildPatientData(req.body || {}, false)
    if ('error' in built) return res.status(400).json({ error: built.error })
    const patient = await prisma.patient.create({ data: { ...(built.data as { fullName: string; phone: string }), clinicId, tenantId } as Parameters<typeof prisma.patient.create>[0]['data'] })
    await writeAudit({ clinicId, tenantId, actorId, module: 'patients', action: 'PATIENT_CREATE', entityType: 'Patient', entityId: patient.id, summary: `Paciente ${patient.fullName} cadastrado.` }).catch((e: unknown) => console.error(e))
    return res.status(201).json(patient)
  } catch (error) {
    console.error('Erro ao cadastrar paciente:', error)
    return res.status(500).json({ error: 'Erro ao cadastrar paciente.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.patient.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Paciente n\u00e3o encontrado.' })
    const built = buildPatientData(req.body || {}, true)
    if ('error' in built) return res.status(400).json({ error: built.error })
    const patient = await prisma.patient.update({ where: { id }, data: built.data as Parameters<typeof prisma.patient.update>[0]['data'] })
    await writeAudit({ clinicId, tenantId, actorId, module: 'patients', action: 'PATIENT_UPDATE', entityType: 'Patient', entityId: id, beforeData: existing, afterData: patient, summary: `Cadastro de ${patient.fullName} atualizado.` }).catch((e: unknown) => console.error(e))
    return res.json(patient)
  } catch (error) {
    console.error('Erro ao atualizar paciente:', error)
    return res.status(500).json({ error: 'Erro ao atualizar paciente.' })
  }
}

export async function remove(req: AuthRequest,res:Response){try{const{clinicId,tenantId,actorId}=ctx(req);const id=String(req.params.id);const existing=await prisma.patient.findFirst({where:{id,clinicId,tenantId}});if(!existing)return res.status(404).json({error:'Paciente n\u00e3o encontrado.'});await prisma.patient.update({where:{id},data:{isActive:false}});await writeAudit({clinicId,tenantId,actorId,module:'patients',action:'PATIENT_DEACTIVATE',entityType:'Patient',entityId:id,summary:`Paciente ${existing.fullName} inativado.`});return res.json({message:'Paciente inativado com sucesso.'})}catch(error){console.error(error);return res.status(500).json({error:'Erro ao inativar paciente.'})}}
