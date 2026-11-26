import { Router, Response } from 'express'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { AuthenticatedRequest, asyncHandler, getTenantId, getUserId, requireRole } from './middleware'
import { hashPassword } from '../../services/userService'
import { senhaInicialPorNascimento } from '../../controllers/authController'
import { writeAudit } from '../../services/auditService'

// ============================================================================
// Provisionamento de acesso de aluno/professor por RA ou nome, com senha inicial
// derivada da data de nascimento (troca obrigatória no 1º acesso — ver
// User.mustChangePassword e POST /auth/change-password). Reset pelo admin cobre
// o caso de o usuário não conseguir recuperar o próprio acesso.
// ============================================================================
const router = Router()

function normalizarNome(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
function primeiroUltimoNome(nomeCompleto: string): [string, string] {
  const partes = nomeCompleto.trim().split(/\s+/)
  return [partes[0], partes.slice(1).join(' ') || partes[0]]
}
async function gerarLoginAlt(nomeCompleto: string): Promise<string> {
  const partes = normalizarNome(nomeCompleto).split(/\s+/).filter(Boolean)
  const base = (partes.length >= 2 ? `${partes[0]}.${partes[partes.length - 1]}` : partes[0] || 'usuario').replace(/[^a-z.]/g, '')
  let candidato = base, n = 1
  while (await prisma.user.findFirst({ where: { loginAlt: candidato } })) { n += 1; candidato = `${base}${n}` }
  return candidato
}

const alunoSchema = z.object({
  ra: z.string().trim().min(1).max(40),
  nomeCompleto: z.string().trim().min(3).max(200),
  email: z.string().trim().email(),
  dataNascimento: z.string().refine((s) => !isNaN(Date.parse(s)), 'Data de nascimento inválida.'),
  cpf: z.string().trim().max(20).optional(),
})

router.post('/credenciais/aluno', requireRole('ADMIN', 'OWNER', 'RECTOR', 'COORDINATOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const clinicId = req.user!.clinicId!
  const d = alunoSchema.parse(req.body)
  const email = d.email.toLowerCase()
  const dataNasc = new Date(d.dataNascimento)

  if (await prisma.student.findUnique({ where: { ra: d.ra } })) return res.status(409).json({ error: 'Já existe um aluno com este RA.' })
  if (await prisma.user.findUnique({ where: { clinicId_email: { clinicId, email } } })) return res.status(409).json({ error: 'Já existe um usuário com este e-mail nesta clínica.' })

  const senha = senhaInicialPorNascimento(dataNasc)
  const [firstName, lastName] = primeiroUltimoNome(d.nomeCompleto)
  const user = await prisma.user.create({
    data: { clinicId, tenantId, email, password: await hashPassword(senha), firstName, lastName, role: 'STUDENT', mustChangePassword: true, dataNascimento: dataNasc },
  })
  const student = await prisma.student.create({
    data: { tenantId, userId: user.id, ra: d.ra, nomeCompleto: d.nomeCompleto, cpf: d.cpf, dataNascimento: dataNasc },
  })
  await writeAudit({ clinicId, tenantId, actorId: getUserId(req), module: 'academico', action: 'ALUNO_PROVISIONADO', entityType: 'Student', entityId: student.id, summary: `Acesso criado para RA ${d.ra}.`, ipAddress: req.ip })
  res.status(201).json({ student, loginInicial: { ra: d.ra, senhaInicial: senha } })
}))

const professorSchema = z.object({
  nomeCompleto: z.string().trim().min(3).max(200),
  email: z.string().trim().email(),
  dataNascimento: z.string().refine((s) => !isNaN(Date.parse(s)), 'Data de nascimento inválida.'),
})

router.post('/credenciais/professor', requireRole('ADMIN', 'OWNER', 'RECTOR', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const clinicId = req.user!.clinicId!
  const d = professorSchema.parse(req.body)
  const email = d.email.toLowerCase()
  const dataNasc = new Date(d.dataNascimento)

  if (await prisma.user.findUnique({ where: { clinicId_email: { clinicId, email } } })) return res.status(409).json({ error: 'Já existe um usuário com este e-mail nesta clínica.' })

  const senha = senhaInicialPorNascimento(dataNasc)
  const loginAlt = await gerarLoginAlt(d.nomeCompleto)
  const [firstName, lastName] = primeiroUltimoNome(d.nomeCompleto)
  const user = await prisma.user.create({
    data: { clinicId, tenantId, email, password: await hashPassword(senha), firstName, lastName, role: 'TEACHER', mustChangePassword: true, dataNascimento: dataNasc, loginAlt },
  })
  await writeAudit({ clinicId, tenantId, actorId: getUserId(req), module: 'academico', action: 'PROFESSOR_PROVISIONADO', entityType: 'User', entityId: user.id, summary: `Acesso criado para ${loginAlt}.`, ipAddress: req.ip })
  res.status(201).json({ userId: user.id, loginInicial: { loginAlt, senhaInicial: senha } })
}))

const gestorPoloSchema = z.object({
  nomeCompleto: z.string().trim().min(3).max(200),
  email: z.string().trim().email(),
  dataNascimento: z.string().refine((s) => !isNaN(Date.parse(s)), 'Data de nascimento inválida.'),
  poloIds: z.array(z.string().min(1)).min(1, 'Informe ao menos um polo.').max(50),
})

// Gestor de polo: mesmo esquema de login (usuário + nascimento) do professor, mas com acesso restrito aos polos
// atribuídos (ModPolo.responsavelUserId) — ver escopoPolo/assertPoloAcesso em modules/modalidades/common.ts.
router.post('/credenciais/gestor-polo', requireRole('ADMIN', 'OWNER', 'RECTOR', 'COORDINATOR'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const clinicId = req.user!.clinicId!
  const d = gestorPoloSchema.parse(req.body)
  const email = d.email.toLowerCase()
  const dataNasc = new Date(d.dataNascimento)

  if (await prisma.user.findUnique({ where: { clinicId_email: { clinicId, email } } })) return res.status(409).json({ error: 'Já existe um usuário com este e-mail nesta clínica.' })
  const polos = await (prisma as any).modPolo.findMany({ where: { id: { in: d.poloIds }, tenantId }, select: { id: true } })
  if (polos.length !== d.poloIds.length) return res.status(404).json({ error: 'Um ou mais polos informados não foram encontrados nesta instituição.' })

  const senha = senhaInicialPorNascimento(dataNasc)
  const loginAlt = await gerarLoginAlt(d.nomeCompleto)
  const [firstName, lastName] = primeiroUltimoNome(d.nomeCompleto)
  const user = await prisma.user.create({
    data: { clinicId, tenantId, email, password: await hashPassword(senha), firstName, lastName, role: 'GESTOR_POLO', mustChangePassword: true, dataNascimento: dataNasc, loginAlt },
  })
  await (prisma as any).modPolo.updateMany({ where: { id: { in: d.poloIds }, tenantId }, data: { responsavelUserId: user.id } })
  await writeAudit({ clinicId, tenantId, actorId: getUserId(req), module: 'academico', action: 'GESTOR_POLO_PROVISIONADO', entityType: 'User', entityId: user.id, summary: `Acesso criado para ${loginAlt} (${d.poloIds.length} polo(s)).`, ipAddress: req.ip })
  res.status(201).json({ userId: user.id, poloIds: d.poloIds, loginInicial: { loginAlt, senhaInicial: senha } })
}))

// Reset de acesso pelo admin: usuário não conseguiu recuperar a própria senha (link de e-mail indisponível/perdido).
// Gera senha temporária aleatória (não a data de nascimento) e força troca no próximo login.
router.post('/credenciais/:userId/resetar', requireRole('ADMIN', 'OWNER', 'RECTOR', 'SECRETARY'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = getTenantId(req)
  const user = await prisma.user.findFirst({ where: { id: String(req.params.userId), tenantId } })
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

  const senhaTemporaria = randomBytes(6).toString('hex')
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(senhaTemporaria), mustChangePassword: true } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ])
  await writeAudit({
    clinicId: user.clinicId, tenantId, actorId: getUserId(req), module: 'academico', action: 'SENHA_RESETADA_ADMIN', entityType: 'User', entityId: user.id,
    summary: 'Senha redefinida pelo administrador (usuário não conseguiu recuperar por conta própria).', ipAddress: req.ip,
  })
  res.json({ senhaTemporaria })
}))

export default router
