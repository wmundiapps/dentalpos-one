import { randomBytes } from 'crypto'
import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'
import { contractCancelSchema, contractSignSchema } from '../validators/eduContractValidator'

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

async function myStudent(req: AuthRequest) {
  const { clinicId, tenantId } = ctx(req)
  if (!req.user) return null
  return prisma.eduStudent.findFirst({ where: { clinicId, tenantId, userId: req.user.id } })
}

function audit(input: { clinicId: string; tenantId: string; actorId: string; action: string; entityType: string; entityId: string; summary?: string }) {
  return writeAudit({ ...input, module: 'edu' })
}

function generateSigningToken() {
  return randomBytes(24).toString('hex')
}

function buildContractTerms(input: {
  institutionName: string
  studentName: string
  programName: string
  termName: string
  contractNumber: string
  monthlyFee: number | null
  tuitionDueDay: number
}) {
  const fee = input.monthlyFee ? `R$ ${input.monthlyFee.toFixed(2)}` : 'a combinar entre as partes'
  return [
    `CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS — ${input.contractNumber}`,
    '',
    'MODELO/RASCUNHO gerado automaticamente a partir dos dados da matrícula. Deve ser revisado por advogado da instituição antes do uso comercial.',
    '',
    `CONTRATANTE (instituição de ensino): ${input.institutionName}`,
    `CONTRATADO(A) (aluno(a) ou responsável legal): ${input.studentName}`,
    `Curso: ${input.programName}`,
    `Período letivo: ${input.termName}`,
    '',
    '1. OBJETO — Prestação de serviços educacionais referentes ao curso e período letivo acima indicados, nos termos do projeto pedagógico e do regimento interno da instituição.',
    `2. MENSALIDADE — Valor de ${fee}, com vencimento todo dia ${input.tuitionDueDay} de cada mês, sujeito a reajuste anual na forma da legislação aplicável.`,
    '3. VIGÊNCIA — Durante o período letivo informado, renovável automaticamente a cada nova matrícula subsequente.',
    '4. TRANCAMENTO E CANCELAMENTO — O(a) aluno(a) pode requerer trancamento ou cancelamento da matrícula conforme o regulamento acadêmico da instituição, observadas eventuais multas e prazos de reembolso previstos em norma interna.',
    '5. PROTEÇÃO DE DADOS — Os dados pessoais do(a) aluno(a) são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018) e a Política de Privacidade da instituição.',
    '6. ACEITE ELETRÔNICO — A assinatura deste contrato pelo link eletrônico de aceite constitui manifestação de vontade válida (modalidade clickwrap), ficando registrados o nome informado pelo(a) signatário(a), o endereço IP e o horário do aceite como evidência da assinatura.'
  ].join('\n')
}

// Chamado pelos fluxos de matrícula (eduAcademicController.createEnrollment e
// eduAdmissionController.convertApplicationToEnrollment) imediatamente após
// a EduEnrollment ser criada — mesmo padrão de automação usado para a
// mensalidade (RecurringBill).
export async function createContractForEnrollment(args: {
  clinicId: string
  tenantId: string
  enrollmentId: string
  studentId: string
  studentName: string
  programName: string
  termName: string
  enrollmentNumber: string
  monthlyFee: number | null | undefined
  tuitionDueDay: number
  createdById: string
}) {
  const clinic = await prisma.clinic.findUnique({ where: { id: args.clinicId } })
  const institutionName = clinic?.displayName || clinic?.name || 'Instituição de Ensino'
  const monthlyFee = args.monthlyFee ?? null
  const termsText = buildContractTerms({
    institutionName, studentName: args.studentName, programName: args.programName, termName: args.termName,
    contractNumber: args.enrollmentNumber, monthlyFee, tuitionDueDay: args.tuitionDueDay
  })
  return prisma.eduEnrollmentContract.create({
    data: {
      clinicId: args.clinicId, tenantId: args.tenantId, enrollmentId: args.enrollmentId, studentId: args.studentId,
      contractNumber: args.enrollmentNumber, institutionName, studentName: args.studentName, programName: args.programName,
      termName: args.termName, monthlyFee, tuitionDueDay: args.tuitionDueDay, termsText,
      signingToken: generateSigningToken(), createdById: args.createdById
    }
  })
}

// ---------------------------------------------------------------
// ADMINISTRATIVO
// ---------------------------------------------------------------

export async function listContracts(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const rows = await prisma.eduEnrollmentContract.findMany({
      where: { clinicId, tenantId, ...(studentId ? { studentId } : {}), ...(status ? { status } : {}) },
      include: { student: true },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar contratos de matrícula.' })
  }
}

export async function getContract(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const id = String(req.params.id)
    const row = await prisma.eduEnrollmentContract.findFirst({ where: { id, clinicId, tenantId }, include: { student: true } })
    if (!row) return res.status(404).json({ error: 'Contrato não encontrado.' })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar contrato.' })
  }
}

export async function cancelContract(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.eduEnrollmentContract.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Contrato não encontrado.' })
    if (existing.status !== 'PENDENTE_ASSINATURA') return res.status(409).json({ error: 'Só é possível cancelar contratos ainda não assinados.' })

    const parsed = contractCancelSchema.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'Dados inválidos.', details: parsed.error.flatten() })

    const row = await prisma.eduEnrollmentContract.update({ where: { id }, data: { status: 'CANCELADO' } })
    await audit({ clinicId, tenantId, actorId, action: 'EDU_CONTRACT_CANCEL', entityType: 'EduEnrollmentContract', entityId: id, summary: `Contrato ${existing.contractNumber} cancelado antes da assinatura.` })
    return res.json(row)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao cancelar contrato.' })
  }
}

// ---------------------------------------------------------------
// PORTAL DO ALUNO (self-service)
// ---------------------------------------------------------------

export async function myContracts(req: AuthRequest, res: Response) {
  try {
    const student = await myStudent(req)
    if (!student) return res.status(404).json({ error: 'Cadastro de aluno não encontrado para este usuário.' })
    const rows = await prisma.eduEnrollmentContract.findMany({ where: { studentId: student.id }, orderBy: { createdAt: 'desc' } })
    return res.json(rows)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao listar meus contratos.' })
  }
}

// ---------------------------------------------------------------
// LINK PÚBLICO DE ASSINATURA (sem autenticação, como o vestibular e a
// verificação de certificado) — o token aleatório de 192 bits é a
// credencial de acesso, enviado diretamente ao(à) aluno(a).
// ---------------------------------------------------------------

export async function getContractByToken(req: Request, res: Response) {
  try {
    const token = String(req.params.token || '')
    const row = await prisma.eduEnrollmentContract.findUnique({ where: { signingToken: token } })
    if (!row) return res.status(404).json({ error: 'Link de assinatura inválido ou expirado.' })
    return res.json({
      contractNumber: row.contractNumber, institutionName: row.institutionName, studentName: row.studentName,
      programName: row.programName, termName: row.termName, monthlyFee: row.monthlyFee, tuitionDueDay: row.tuitionDueDay,
      termsText: row.termsText, status: row.status, signedAt: row.signedAt, signedByName: row.signedByName
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao carregar contrato.' })
  }
}

export async function signContractByToken(req: Request, res: Response) {
  try {
    const token = String(req.params.token || '')
    const row = await prisma.eduEnrollmentContract.findUnique({ where: { signingToken: token } })
    if (!row) return res.status(404).json({ error: 'Link de assinatura inválido ou expirado.' })
    if (row.status === 'CANCELADO') return res.status(409).json({ error: 'Este contrato foi cancelado e não pode mais ser assinado.' })
    if (row.status === 'ASSINADO') return res.status(409).json({ error: 'Este contrato já foi assinado.', signedAt: row.signedAt })

    const parsed = contractSignSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Informe o nome completo para confirmar a assinatura.', details: parsed.error.flatten() })

    const signedIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
    const signedUserAgent = String(req.headers['user-agent'] || '').slice(0, 500)

    const updated = await prisma.eduEnrollmentContract.update({
      where: { id: row.id },
      data: { status: 'ASSINADO', signedAt: new Date(), signedByName: parsed.data.signedByName, signedIp, signedUserAgent }
    })
    await writeAudit({
      clinicId: row.clinicId, tenantId: row.tenantId, module: 'edu', action: 'EDU_CONTRACT_SIGN',
      entityType: 'EduEnrollmentContract', entityId: row.id,
      summary: `Contrato ${row.contractNumber} assinado eletronicamente por "${parsed.data.signedByName}" (link público, sem usuário autenticado).`,
      ipAddress: signedIp, userAgent: signedUserAgent
    })
    return res.json({ status: updated.status, signedAt: updated.signedAt })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Erro ao registrar assinatura.' })
  }
}
