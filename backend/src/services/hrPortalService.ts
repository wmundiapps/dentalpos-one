import jwt from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { writeAudit } from './auditService'
import { comparePassword, hashPassword } from './userService'

// Área do colaborador: CPF + senha individual. O token vale só para o próprio colaborador e não abre o sistema da clínica.
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const secret = () => `${process.env.JWT_SECRET || ''}:colaborador`
const attempts = new Map<string, { count: number; until: number }>()

export async function setPortalPassword(c: { clinicId: string; tenantId: string; actorId: string }, employeeId: string, password: unknown) {
  const pwd = String(password ?? '')
  if (pwd.length < 6 || pwd.length > 72) return { error: 'A senha precisa ter de 6 a 72 caracteres.' }
  const emp = await prisma.hREmployee.findFirst({ where: { id: employeeId, clinicId: c.clinicId, tenantId: c.tenantId }, select: { id: true, name: true, cpf: true } })
  if (!emp) return { error: 'Colaborador não encontrado.', status: 404 }
  if (digits(emp.cpf).length !== 11) return { error: 'Cadastre o CPF do colaborador antes de criar a senha.' }
  const passwordHash = await hashPassword(pwd)
  await prisma.hREmployeePortal.upsert({ where: { employeeId: emp.id }, update: { passwordHash }, create: { employeeId: emp.id, clinicId: c.clinicId, tenantId: c.tenantId, passwordHash } })
  await writeAudit({ clinicId: c.clinicId, tenantId: c.tenantId, actorId: c.actorId, module: 'hr', action: 'EMPLOYEE_PORTAL_PASSWORD', entityType: 'HREmployee', entityId: emp.id, summary: `Senha da área do colaborador definida para ${emp.name}.` }).catch(() => undefined)
  return { ok: true }
}

export async function portalLogin(cpf: unknown, password: unknown, ip: string) {
  const d = digits(cpf)
  const key = `${d}:${ip}`
  const lock = attempts.get(key)
  if (lock && lock.until > Date.now()) return { error: 'Muitas tentativas. Aguarde alguns minutos.', status: 429 }
  const fail = () => {
    const f = attempts.get(key) || { count: 0, until: 0 }
    f.count += 1
    if (f.count >= 5) { f.until = Date.now() + 10 * 60 * 1000; f.count = 0 }
    attempts.set(key, f)
    return { error: 'CPF ou senha incorretos.', status: 401 }
  }
  if (d.length !== 11 || !password) return fail()
  const rows = await prisma.hREmployeePortal.findMany({ select: { passwordHash: true, employeeId: true }, take: 5000 })
  const hashes = new Map(rows.map((r) => [r.employeeId, r.passwordHash]))
  const emps = await prisma.hREmployee.findMany({ where: { id: { in: [...hashes.keys()] }, cpf: { not: null } }, select: { id: true, clinicId: true, tenantId: true, name: true, cpf: true, status: true }, take: 5000 })
  for (const e of emps.filter((r) => digits(r.cpf) === d && !['TERMINATED', 'Desligado'].includes(r.status))) {
    if (await comparePassword(String(password), hashes.get(e.id) as string)) {
      attempts.delete(key)
      const token = jwt.sign({ kind: 'colaborador', employeeId: e.id, clinicId: e.clinicId, tenantId: e.tenantId }, secret(), { expiresIn: '2h' })
      return { token, name: e.name }
    }
  }
  return fail()
}

export type PortalReq = Request & { portal?: { employeeId: string; clinicId: string; tenantId: string } }
export function portalAuth(req: PortalReq, res: Response, next: NextFunction) {
  const h = String(req.headers.authorization || '')
  try {
    const p = jwt.verify(h.replace(/^Bearer /, ''), secret()) as { kind?: string; employeeId: string; clinicId: string; tenantId: string }
    if (p.kind !== 'colaborador') throw new Error('tipo')
    req.portal = { employeeId: p.employeeId, clinicId: p.clinicId, tenantId: p.tenantId }
    return next()
  } catch { return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' }) }
}
