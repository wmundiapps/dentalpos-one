import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { writeAudit } from '../services/auditService'

const ROLES = ['ASB', 'TSB', 'LAB_PROTESE']
const TEXT = ['phone', 'email', 'registryNumber', 'companyName', 'notes'] as const

function ctx(req: AuthRequest) {
  if (!req.user) throw new Error('Usuário não autenticado')
  return { clinicId: req.user.clinicId, tenantId: req.user.tenantId, actorId: req.user.id }
}

function build(body: Record<string, unknown>, partial: boolean) {
  const data: Record<string, unknown> = {}
  if (!partial || 'role' in body) {
    const role = String(body.role || '').toUpperCase()
    if (!ROLES.includes(role)) return { error: 'Função inválida. Use ASB, TSB ou laboratório de prótese.' }
    data.role = role
  }
  if (!partial || 'fullName' in body) {
    const name = String(body.fullName || '').trim()
    if (name.length < 2) return { error: 'Informe o nome.' }
    data.fullName = name
  }
  for (const key of TEXT) {
    if (!(key in body)) continue
    const value = String(body[key] ?? '').trim()
    data[key] = value || null
  }
  if ('showInAgenda' in body) data.showInAgenda = body.showInAgenda === true
  if ('isActive' in body) data.isActive = body.isActive === true
  return { data }
}

export async function index(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId } = ctx(req)
    const rows = await prisma.teamMember.findMany({ where: { clinicId, tenantId, isActive: true }, orderBy: [{ role: 'asc' }, { fullName: 'asc' }] })
    return res.json(rows)
  } catch (error) {
    console.error('Erro ao listar equipe:', error)
    return res.status(500).json({ error: 'Erro ao listar equipe.' })
  }
}

export async function store(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const built = build(req.body || {}, false)
    if (built.error) return res.status(400).json({ error: built.error })
    const row = await prisma.teamMember.create({ data: { ...(built.data as { role: string; fullName: string }), clinicId, tenantId } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'team', action: 'TEAM_MEMBER_CREATE', entityType: 'TeamMember', entityId: row.id, summary: `${row.role}: ${row.fullName}` }).catch((e: unknown) => console.error(e))
    return res.status(201).json(row)
  } catch (error) {
    console.error('Erro ao cadastrar membro da equipe:', error)
    return res.status(500).json({ error: 'Erro ao cadastrar.' })
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.teamMember.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Cadastro não encontrado.' })
    const built = build(req.body || {}, true)
    if (built.error) return res.status(400).json({ error: built.error })
    const row = await prisma.teamMember.update({ where: { id }, data: built.data as Parameters<typeof prisma.teamMember.update>[0]['data'] })
    await writeAudit({ clinicId, tenantId, actorId, module: 'team', action: 'TEAM_MEMBER_UPDATE', entityType: 'TeamMember', entityId: id, summary: `${row.role}: ${row.fullName}` }).catch((e: unknown) => console.error(e))
    return res.json(row)
  } catch (error) {
    console.error('Erro ao atualizar membro da equipe:', error)
    return res.status(500).json({ error: 'Erro ao atualizar.' })
  }
}

// Inativa (não apaga): agendamentos antigos continuam apontando para o cadastro.
export async function remove(req: AuthRequest, res: Response) {
  try {
    const { clinicId, tenantId, actorId } = ctx(req)
    const id = String(req.params.id)
    const existing = await prisma.teamMember.findFirst({ where: { id, clinicId, tenantId } })
    if (!existing) return res.status(404).json({ error: 'Cadastro não encontrado.' })
    await prisma.teamMember.update({ where: { id }, data: { isActive: false } })
    await writeAudit({ clinicId, tenantId, actorId, module: 'team', action: 'TEAM_MEMBER_DEACTIVATE', entityType: 'TeamMember', entityId: id, summary: `${existing.role}: ${existing.fullName}` }).catch((e: unknown) => console.error(e))
    return res.json({ message: 'Cadastro inativado.' })
  } catch (error) {
    console.error('Erro ao inativar membro da equipe:', error)
    return res.status(500).json({ error: 'Erro ao inativar.' })
  }
}
